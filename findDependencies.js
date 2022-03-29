// USAGE:  node ./findDependencies.js myProjectFolder               # will show class dependencies
//         node ./findDependencies.js myProjectFolder --trigger     # will show trigger vs class dependencies

// extracts class and method names, then finds dependencies between them and opens a dependency graph using Mermaid JS

// INITIALIZATION

    var fs = require('fs');

    var getItemList = ( projectFolder, subFolder, extension ) => {
        // collect classes in folder
        console.log( `Looking for ${subFolder} in folder:  ${projectFolder}` );
        let path = `${projectFolder}/${subFolder}`;
        let fileList = fs.readdirSync( path );
        fileList = fileList.filter( fileName => fileName.endsWith( extension ) 
                                    && ! fileName.toLowerCase().includes( 'test' ) );

        let itemList = fileList.map( fileName => { 
            return { 
                name: fileName.substring( 0, fileName.length - extension.length )
                , filePath: path + '/' + fileName 
            }
        } );

        return itemList;
    }

    var getAdjustedProjectFolder = ( projectFolder ) => {
        if( ! projectFolder.includes( 'force-app' ) ) {
            return projectFolder + '/force-app/main/default';
        }

        if( ! projectFolder.includes( 'main' ) ) {
            return  projectFolder + '/main/default';
        }

        if( ! projectFolder.includes( 'default' ) ) {
            return projectFolder + '/default';
        }
        return projectFolder;
    }

    var addNewItemToMap = ( crossReferenceMap, aName, aType ) => {
        if( ! crossReferenceMap.has( aName ) ) {
            let anItemData = new ItemData( aName, aType );
            crossReferenceMap.set( aName, anItemData );
        }
    }

    var getMethodReferences = ( classText, aClassName ) => {
        // use set to remove duplicates from the list of method calls
        let methodReferenceSet = new Set();

        // detect instantiation:  = new className(
        const reInstantiation = new RegExp( 'new ' + aClassName + '\\(', 'g' );
        const foundInstantiation = reInstantiation.test( classText );

        if( foundInstantiation ) {
            methodReferenceSet.add( 'instantiation' );
        }

        // detect method calls:  className.methodName(
        const reStaticMethods = new RegExp( aClassName + '\\.([^ <>\\.]*?)\\(', 'g' );
        let foundMethods = classText.match( reStaticMethods );

        if( foundMethods ) {
            foundMethods.forEach( aMatch => {
                methodReferenceSet.add( aMatch.replace( aClassName + '.', '' ).replace( '(', '' ) );
            } );
        }

        return methodReferenceSet;
    }

    var getReferenceData = ( itemName, methodReferenceSet ) => {
        // add method calls to the references list of the outer class
        let referenceData = {
            className: itemName
            , methodReferences: [ ...methodReferenceSet ]
        };

        return referenceData;
    }

    var updateClassReferenceData = ( crossReferenceMap, itemName, methodReferenceSet ) => {
        // increase referenced count on inner class record
        let anItemData = crossReferenceMap.get( itemName );
        if( ! anItemData ) {
            anItemData = new ItemData( itemName, CLASSType );
        }
        anItemData.referencedCount++;

        // add method to inner class record but remove duplicates
        anItemData.methodReferences.push( ...methodReferenceSet );
        let methodRefMap = new Set( anItemData.methodReferences );
        anItemData.methodReferences = [ ...methodRefMap ];

        return anItemData;
    }

    var getFormattedMethodReferenceStringList = ( aReference, crossReferenceMap ) => {
        let methodList = '';
        if( aReference.methodReferences.length > 0 ) {
            // concatenate method list with line breaks
            let referencedClass = crossReferenceMap.get( aReference.className );
            let methodReferencesText = referencedClass.methodReferences.reduce( 
                ( prev, next ) => prev + '<br>' + next, ''
            );
            methodList = `(${aReference.className}<br>${methodReferencesText})`;
        }

        return methodList;
    }

    const CLASSType = 'CLASS';
    const TRIGGERType = 'TRIGGER';

    class ItemData {
        constructor( className, aType ) {
            this.className = className;
            this.type = aType;
            this.references = [];
            this.referencedCount = 0;
            this.methodReferences = [];
            this.publicName = className + ( aType != CLASSType ? ' ' + aType : '' );
        }
    }

// MAIN

// skip first 2 elements:  node and path
const myArgs = process.argv.slice( 2 );

// set proper folder location
let projectFolder = myArgs[ 0 ];

let verboseFlag = myArgs.includes( '--verbose' );
let triggerFlag = myArgs.includes( '--trigger' ) || myArgs.includes( '--triggers' );
let lwcFlag = myArgs.includes( '--lwc' ) || myArgs.includes( '--LWC' );
let classFlag = ! triggerFlag && ! lwcFlag;

projectFolder = getAdjustedProjectFolder( projectFolder );

let sortedClassReferenceArray;
let crossReferenceMap = new Map();
let classList;
if( classFlag || triggerFlag || lwcFlag ) {
    // collect classes in folder
    classList = getItemList( projectFolder, 'classes', '.cls' );

    if( classList.length == 0 ) {
        console.log( 'No classes were found.' );
        return;
    }

    // collect class bodies, identify references and count them
    classList.forEach( aClass => {
        if( verboseFlag ) {
            console.log( "Reading class:", aClass.name, aClass.filePath );
        }

        const classText = fs.readFileSync( aClass.filePath, 'utf8' );

        // skip dependencies between classes if looking at triggers
        if( triggerFlag ) {
            return;
        }

        // find all references to other classes and store in map
        classList.forEach( innerclass => {
            if( innerclass.name == aClass.name 
                        || ! classText.includes( innerclass.name ) ) {
                return;
            }
        
            // add class to the map if not already there
            addNewItemToMap( crossReferenceMap, aClass.name, CLASSType );
     
            // detect method calls
            let methodReferenceSet = getMethodReferences( classText, innerclass.name );
       
            // add method calls to the reference list
            let referenceData = getReferenceData( innerclass.name, methodReferenceSet );

            // add method calls to the references list of the outer class
            crossReferenceMap.get( aClass.name ).references.push( referenceData );
            
            // increase referenced count and add method 
            // to inner class record without duplicates
            let updatedItemData = updateClassReferenceData( crossReferenceMap, innerclass.name, methodReferenceSet );

            // store inner class record in map
            crossReferenceMap.set( innerclass.name, updatedItemData );
        } );

        // add unreferenced classes if needed
        addNewItemToMap( crossReferenceMap, aClass.name, CLASSType );
    });

    // sort map of classes by their referenced count (descending) + count of references to other classes
    sortedClassReferenceArray = [...crossReferenceMap.values()].sort( 
                    (a, b) => b.referencedCount + b.references.length - a.referencedCount - a.references.length );
    // other sort criteria will give more or less legible output
    //sortedClassReferenceArray = [...crossReferenceMap.values()].sort( (a, b) => b.referencedCount - a.referencedCount );
    //sortedClassReferenceArray = [...crossReferenceMap.values()].sort( (a, b) => b.references.length - a.references.length );
}

if( triggerFlag ) {
    // collect triggers in folder
    let triggerList = getItemList( projectFolder, 'triggers', '.trigger' );

    // collect trigger bodies, identify references and count them
    triggerList.forEach( aTrigger => {
        if( verboseFlag ) {
            console.log( "Reading trigger:", aTrigger.name, aTrigger.filePath );
        }

        const triggerText = fs.readFileSync( aTrigger.filePath, 'utf8' );

        // find all references from trigger to classes and store in map
        classList.forEach( innerclass => {
            if( ! triggerText.includes( innerclass.name ) ) {
                return;
            }
        
            // add trigger to the map if not already there
            addNewItemToMap( crossReferenceMap, aTrigger.name, TRIGGERType );

            // detect method calls
            let methodReferenceSet = getMethodReferences( triggerText, innerclass.name );
            
            // detect method calls and add to the reference list
            let referenceData = getReferenceData( innerclass.name, methodReferenceSet );

            // add method calls to the references list of the outer class
            crossReferenceMap.get( aTrigger.name ).references.push( referenceData );

            // increase referenced count and add method 
            // to inner class record without duplicates
            let updatedItemData = updateClassReferenceData( crossReferenceMap, innerclass.name, methodReferenceSet );
            
            // store inner class record in map
            crossReferenceMap.set( innerclass.name, updatedItemData );
        } );

    } );

    sortedClassReferenceArray = [...crossReferenceMap.values()];
}

// list classes and their references in mermaid format inside HTML
console.log( "Composing dependency graph:" );
let graphHTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
            + '</head><body><div id="theGraph" class="mermaid">\ngraph LR\n';
let elementsWithMoreRefs = [];
let triggerList = [];
sortedClassReferenceArray.forEach( value => {

    if( !value.references || value.references.length == 0 ) {
        let dependencyFlow = `${value.className}(${value.publicName})\n`;
        graphHTML += dependencyFlow;
        if( verboseFlag ) {
            console.log( dependencyFlow );
        }
        return;
    }

    // highlight classes that dependend more on other classes
    if( value.references.length >= 6 ) {
        elementsWithMoreRefs.push( value.className );
    }
    if( value.type == TRIGGERType ) {
        triggerList.push( value.className );
    }

    // prepare text for Mermaid output (dependency graph)
    value.references.forEach( aReference => {

        // add class dependency to the graph in Mermaid notation
        let methodList = getFormattedMethodReferenceStringList( aReference, crossReferenceMap );
        
        graphHTML += `${value.className}(${value.publicName}) --> ${aReference.className}${methodList}\n`;

        if( verboseFlag ) {
            console.log( dependencyFlow );
        }

    } );

});

if( elementsWithMoreRefs.length > 0 ) {
    graphHTML += `\nclassDef moreRefs fill:orange,stroke-width:4px;\nclass ${elementsWithMoreRefs} moreRefs\n`;
}
if( triggerList.length > 0 ) {
    graphHTML += `\nclassDef triggers fill:cyan,stroke-width:4px;\nclass ${triggerList} triggers\n`;
}
graphHTML += '</div><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>';
graphHTML += '<script>mermaid.initialize({startOnLoad:true,securityLevel:\'loose\'}); ';
graphHTML += 'setTimeout( () => { var theGraph = document.querySelector("#theGraph SVG"); ';
graphHTML += 'theGraph.setAttribute("height","100%"); }, 1000 );</script></body></html>';

fs.writeFileSync( './dependencyGraph.html', graphHTML );
console.log( 'dependencyGraph.html written successfully' );

// open browser with dependency graph
const open = require('open');
(async () => {
    await open( './dependencyGraph.html' , {wait: false} );
    console.log( 'The dependency graph should now display on the browser (scroll down if needed)' );
}) ();