// USAGE:  node ./dependencyGraph.js myProjectFolder               # will show class dependencies
//         node ./dependencyGraph.js myProjectFolder --trigger     # will show trigger vs class dependencies

// extracts class and method names, then finds dependencies between them and opens a dependency graph using Mermaid JS

// INITIALIZATION

    var fs = require('fs');

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

        console.log( 'Error:  Choose a folder containing project files.' );
        return null;
    }

    class ItemType {
        hasJS = false;
        constructor( type, folder, extension, referenceRegex, color ) {
            this.type = type;
            this.folder = folder;
            this.extension = extension;
            this.referenceRegex = referenceRegex;
            this.color = color;
        }
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList;
            try {
                fileList = fs.readdirSync( path );
            } catch( e ) {
                console.log( `Error:  Could not read folder ${path}` );
                return null;
            }
            fileList = fileList.filter( fileName => fileName.endsWith( this.extension ) 
                                        && ! fileName.toLowerCase().includes( 'test' ) );
    
            let itemList = fileList.map( fileName => { 
                return new ItemData( fileName.substring( 0, fileName.length - this.extension.length )
                                , this
                                , `${path}/${fileName}` );
            } );
    
            return itemList;
        }
    }
    class JSItemType extends ItemType {
        hasJS = true;
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let subfolderList;
            try {
                subfolderList = fs.readdirSync( path );
            } catch( e ) {
                console.log( `Error:  Could not read folder ${path}` );
                return null;
            }
    
            // JS items are in subfolders
            let itemList = subfolderList.map( subfolder => { 
                if( subfolder.includes( '.json' ) ) {
                    return;
                }
                return new ItemData( subfolder
                                , this
                                , `${path}/${subfolder}/${subfolder}${this.extension}` );
            } );
    
            return itemList;
        }
    }

    const CLASSType = 'CLASS', TRIGGERType = 'TRIGGER', AURAType = 'AURA', LWCType = 'LWC'
        , FLOWType = 'FLOW', WORKFLOWType = 'WORKFLOW'; // PROCESSBUILDERType = 'PBFLOW?'
    const itemTypeMap = new Map();
    itemTypeMap.set( CLASSType, new ItemType( CLASSType, 'classes', '.cls', '${className}\\.([^ <>\\.]*?)\\(', 'lightblue' ) );
    itemTypeMap.set( TRIGGERType, new ItemType( TRIGGERType, 'triggers', '.trigger', 'new ${className}\\(', 'cyan' ) );
    itemTypeMap.set( AURAType, new JSItemType( AURAType, 'aura', '.cmp', null, 'yellow' ) );
    itemTypeMap.set( LWCType, new JSItemType( LWCType, 'lwc', '.html'
                    , 'import .*? from \'@salesforce/apex/${className}.(.*?)\';', 'lightgreen' ) );
    itemTypeMap.set( FLOWType, new ItemType( FLOWType, 'flow', '.flow', null, 'pink' ) );  // ?

    class ItemData {
        constructor( aName, anItemType, filePath ) {
            this.name = aName;
            this.itemType = anItemType;
            this.filePath = filePath;
            this.references = [];
            this.referencedCount = 0;
            this.methodReferencesSet = new Set();
            this.publicName = this.name +' '+ anItemType.type;
            this.additionalInfo = '';
            this.componentName = 'c-' + aName.replace( /([A-Z])/g, (g) => `-${g[0].toLowerCase()}` );
        }
        getItemText = () => {
            // read file
            let itemText = '';
            try {
                if( verboseFlag ) {
                    console.log( `Reading ${this.itemType.type}:  ${this.name} at ${this.filePath}` );
                }
                itemText = fs.readFileSync( this.filePath, 'utf8' );
            } catch( e ) {
                console.log( `Error:  Could not read file ${this.filePath}` );
                return;
            }
            // JS items have an additional .js file
            let itemTextJS = '';
            let filePathJS = this.filePath.replace( this.itemType.extension, '.js' );
            if( this.itemType.hasJS ) {
                try {
                    if( verboseFlag ) {
                        console.log( `Reading ${this.itemType.type}:  ${this.name} at ${filePathJS}` );
                    }
                    itemTextJS = fs.readFileSync( filePathJS, 'utf8' );
                } catch( e ) {
                    console.log( `Error:  Could not read file ${filePathJS}` );
                    return;
                }
            }
            return itemText +'////\n'+ itemTextJS;
        }
        getReferenceSet = ( theText, className ) => {
            // detect method calls:  className.methodName(
            let regexExpression = this.itemType.referenceRegex.replace( '${className}', className );
            //console.log( `Looking for ${regexExpression} in ${this.name}` );
            const reMatchReferences = new RegExp( regexExpression, 'g' );
            let foundReferences = theText.match( reMatchReferences );

            let methodReferenceSet = new Set();
            const reNew = /new .*/i;
            const reImport = /import .*? from '@salesforce\/apex\//i;
            if( foundReferences ) {
                foundReferences.forEach( aMatch => {
                    methodReferenceSet.add( aMatch.replace( className + '.', '' )
                        .replace( '(', '' )
                        .replace( reNew, 'instantiation' )
                        .replace( reImport, '' )
                        .replace( '\';', '' ) );
                } );
            }
    
            return methodReferenceSet;
        }
        getFormattedMethodReferenceStringList = () => {
            if( !this.methodReferencesSet || this.methodReferencesSet.size === 0 ) {
                return '';
            }
    
            // concatenate method list with line breaks
            let methodReferencesText = [...this.methodReferencesSet].reduce( 
                ( prev, next ) => prev + '<br>' + next, ''
            );
    
            return `(${this.publicName}<br>${methodReferencesText})`;
        }
    }

    var getFormattedMethodReferenceStringList = ( aReference ) => {
        if( !aReference.methodReferencesSet || aReference.methodReferencesSet.size === 0 ) {
            return '';
        }

        // concatenate method list with line breaks
        let methodReferencesText = [...aReference.methodReferencesSet].reduce( 
            ( prev, next ) => prev + '<br>' + next, ''
        );

        return `(${aReference.publicName}<br>${methodReferencesText})`;
    }

// MAIN

// skip first 2 elements:  node and path
const myArgs = process.argv.slice( 2 );

// set proper folder location
let projectFolder = myArgs[ 0 ];
projectFolder = getAdjustedProjectFolder( projectFolder );
if( projectFolder == null ) {
    return;
}

let triggerFlag = myArgs.includes( '--trigger' ) || myArgs.includes( '--triggers' );
let lwcFlag = myArgs.includes( '--lwc' ) || myArgs.includes( '--LWC' );
let auraFlag = myArgs.includes( '--aura' ) || myArgs.includes( '--AURA' );
let flowFlag = myArgs.includes( '--flow' ) || myArgs.includes( '--FLOW' );
let classFlag = !triggerFlag && !lwcFlag && !auraFlag && !flowFlag;

let verboseFlag = myArgs.includes( '--verbose' );

let crossReferenceMap = new Map();

// collect file paths for each of the item types
itemTypeMap.forEach( ( itemType ) => {
    let itemListForType = itemType.getItemList( projectFolder );
    //console.log( itemListForType );
    if( itemListForType == null ) {
        return;
    }

    // store list of files per each type
    itemType.itemsList = [ ...itemListForType ];

    // check the contents of each file
    itemType.itemsList.forEach( anItem => {
        if( ! anItem ) {
            return;
        }

        let itemText = anItem.getItemText();

        // find all references from one LWC to another and store in map
        if( lwcFlag && itemType.type === LWCType ) {
            let lwcItemList = itemTypeMap.get( LWCType ).itemsList;
            lwcItemList.forEach( lwcItem => {
                if( ! lwcItem ) {
                    return;
                }
                if( ! itemText || lwcItem.name == anItem.name 
                            || ! itemText.includes( lwcItem.componentName ) ) {
                    return;
                }

                // add lwc to the references list of the outer item
                anItem.references.push( lwcItem );

                // increase referenced count
                lwcItem.referencedCount++;
                
                // store referenced class in xref map
                crossReferenceMap.set( lwcItem.name, lwcItem );
            } );
        }

        // find all references to classes and store in map
        let classItemList = itemTypeMap.get( CLASSType ).itemsList;
        classItemList.forEach( innerclass => {
            if( ! itemText || innerclass.name == anItem.name 
                        || ! itemText.includes( innerclass.name ) ) {
                return;
            }

            // detect and collect method calls in a set
            let methodReferencesSet = anItem.getReferenceSet( itemText, innerclass.name );
            //console.log( `methodReferencesSet for ${innerclass.name}`, methodReferencesSet );

            // add class to the references list of the outer item
            anItem.references.push( innerclass );

            // increase referenced count
            innerclass.referencedCount++;

            // add method to inner class record without duplicates
            if( methodReferencesSet.size > 0 ) {
                innerclass.methodReferencesSet.add( ...methodReferencesSet );
            }
            //console.log( `added methodReferencesSet for ${innerclass.name}`, innerclass.methodReferencesSet );

            // store referenced class in xref map
            crossReferenceMap.set( innerclass.name, innerclass );
        } );

        // store item in xref map
        crossReferenceMap.set( anItem.name, anItem );

    } );
} );

// sort map of classes by their referenced count (descending) + count of references to other classes
sortedClassReferenceArray = [...crossReferenceMap.values()].sort( 
        (a, b) => b.referencedCount + b.references.length - a.referencedCount - a.references.length );

// list classes and their references in mermaid format inside HTML
console.log( "Composing dependency graph:" );
let graphDefinition = 'graph LR\n';
let elementsWithMoreRefs = [];
let triggerList = [];
let independentItemList = [];
let listByType = new Map();
sortedClassReferenceArray.forEach( anItem => {

    if( classFlag && anItem.itemType.type != CLASSType ) {
        return;
    }
    if( triggerFlag && anItem.itemType.type != TRIGGERType ) {
        return;
    }
    if( lwcFlag && anItem.itemType.type != LWCType ) {
        return;
    }
    if( auraFlag && anItem.itemType.type != AURAType ) {
        return;
    }
    if( flowFlag && anItem.itemType.type != FLOWType ) {
        return;
    }

    // display items that do not have dependencies as a single shape
    if( !anItem.references || anItem.references.length == 0 ) {
        independentItemList.push( `${anItem.publicName}` );
        return;
    }

    // highlight in orange items that dependend on 6+ other items
    if( anItem.references.length >= 6 ) {
        elementsWithMoreRefs.push( anItem.name );

    } else {
        // add class to list segregated by type
        let list = listByType.get( anItem.itemType.type );
        if( !list ) {
            list = [];
        }
        list.push( anItem.name );
        listByType.set( anItem.itemType.type, list );
    }

    // prepare text for Mermaid output (dependency graph)
    anItem.references.forEach( aReference => {
        // add class dependency to the graph in Mermaid notation
        let methodList = aReference.getFormattedMethodReferenceStringList();// aReference );
        
        let dependencyFlow = `${anItem.name}(${anItem.publicName}) --> ${aReference.name}${methodList}\n`;
        graphDefinition += dependencyFlow;

        // if( verboseFlag ) {
        //     console.log( `graphDefinition with dependencies:`, dependencyFlow );
        // }
    } );
} );


// add CSS class to elements with more references
let styleSheetList = '';
if( elementsWithMoreRefs.length > 0 ) {
    styleSheetList = `\nclassDef moreRefs fill:orange,stroke-width:4px;\nclass ${elementsWithMoreRefs} moreRefs\n`;
}

// add CSS class for each type of item
listByType.forEach( ( aListItem, itemType ) => {
    let color = itemTypeMap.get( itemType ).color;
    styleSheetList += `\nclassDef ${itemType} fill:${color},stroke-width:4px;\nclass ${aListItem} ${itemType}\n`;
} );

// build HTML page with dependency graph
let independentItemElement = ( independentItemList.length === 0 ? '' :
                    'independentItems(ITEMS WITH NO DEPENDENCIES:<br><br>' + independentItemList.join( '<br>' ) + ')\n' );

let graphHTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
            + '</head><body><div id="theGraph" class="mermaid">\n'
            + graphDefinition
            + independentItemElement
            + styleSheetList
            +'</div><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>'
            + '<script>mermaid.initialize({startOnLoad:true,securityLevel:\'loose\'}); '
            + 'setTimeout( () => { var theGraph = document.querySelector("#theGraph SVG"); '
            + 'theGraph.setAttribute("height","100%"); }, 1000 );</script></body></html>';

// save HTML page with dependency graph
fs.writeFileSync( './dependencyGraph.html', graphHTML );
console.log( 'dependencyGraph.html written successfully' );

// open browser with dependency graph
const open = require('open');
(async () => {
    await open( './dependencyGraph.html' , {wait: false} );
    console.log( 'The dependency graph should now display on the browser (scroll down if needed)' );
}) ();