// USAGE:  node ./dependencyGraph.js myProjectFolder               # will show class dependencies
//         node ./dependencyGraph.js myProjectFolder --trigger     # will show trigger vs class dependencies

// extracts class and method names, then finds dependencies between them and opens a dependency graph using Mermaid JS

// INITIALIZATION

    var fs = require('fs');

    var getAdjustedProjectFolder = ( projectFolder ) => {
        const path = require( 'path' );
        projectFolder = path.resolve( projectFolder );

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
        getComponentName( aName ) {
            //let componentName = `${aName}.`;
            return aName;
        }
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList;
            if( fs.existsSync( path ) ) {
                fileList = fs.readdirSync( path );
            } else {
                return null;
            }
            
            fileList = fileList.filter( fileName => ! fileName.startsWith( '.' )
                                        && ! fileName.toLowerCase().includes( 'test' ) 
                                        && fileName.endsWith( this.extension ) );
    
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
        getComponentName( aName ) {
            let componentName = aName;
            if( this.type === LWCType ) {
                // convert camelCase to kebab-case
                componentName = 'c-' + aName.replace( /([A-Z])/g, (g) => `-${g[0].toLowerCase()}` );
            }
            if( this.type === AURAType ) {
                componentName = `c:${aName} `;
            }
            return componentName;
        }
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let subfolderList;

            if( fs.existsSync( path ) ) {
                subfolderList = fs.readdirSync( path );
            } else {
                return null;
            }
    
            // JS items are in subfolders
            let itemList = subfolderList.map( subfolder => { 
                if( subfolder.includes( '.json' ) || subfolder.startsWith( '.' ) ) {
                    return null;
                }
                return new ItemData( subfolder
                                , this
                                , `${path}/${subfolder}/${subfolder}${this.extension}` );
            } );
    
            return itemList;
        }
    }
    class VFItemType extends ItemType {
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList;
            if( fs.existsSync( path ) ) {
                fileList = fs.readdirSync( path );
            }
            fileList = ( fileList ? fileList : [] );
            // include VF components too
            if( this.type == PAGEType ) {
                let componentPath = `${projectFolder}/components`;
                let componentFileList;
                console.log( `Looking for /components in folder:  ${projectFolder}` );
                if( fs.existsSync( componentPath ) ) {
                    componentFileList = fs.readdirSync( componentPath );
                    fileList.push( ...componentFileList );
                }
            }
            if( !fileList ) {
                return null;
            }
            
            fileList = fileList.filter( fileName => ! fileName.startsWith( '.' )
                                        && ! fileName.toLowerCase().includes( 'test' ) 
                                        && ( fileName.endsWith( this.extension ) 
                                            || fileName.endsWith( '.component' ) ) );
    
            let itemList = fileList.map( fileName => {
                let itemName = fileName.substring( 0, fileName.length - this.extension.length );
                let filePath = `${path}/${fileName}`;
                // handle VF components
                if( fileName.endsWith( '.component' ) ) {
                    itemName = fileName.substring( 0, fileName.length - '.component'.length );
                    filePath = `${projectFolder}/components/${fileName}`;
                }
                return new ItemData( itemName, this, filePath );
            } );
    
            return itemList;
        }
    }

    const CLASSType = 'CLASS', TRIGGERType = 'TRIGGER', AURAType = 'AURA', LWCType = 'LWC'
        , FLOWType = 'FLOW', WORKFLOWType = 'WORKFLOW', PAGEType = 'VISUALFORCE'; // PROCESSBUILDERType = 'PBFLOW?'
    const itemTypeMap = new Map();
    itemTypeMap.set( CLASSType, new ItemType( CLASSType, 'classes', '.cls', '${className}\\.([^ <>\\.]*?)\\(', 'lightblue' ) );
    itemTypeMap.set( TRIGGERType, new ItemType( TRIGGERType, 'triggers', '.trigger', 'new ${className}\\(', 'cyan' ) );
    itemTypeMap.set( AURAType, new JSItemType( AURAType, 'aura', '.cmp', 'controller="${className}"', 'yellow' ) );
    itemTypeMap.set( LWCType, new JSItemType( LWCType, 'lwc', '.html'
                    , 'import .*? from \'@salesforce/apex/${className}.(.*?)\';', 'lightgreen' ) );
    itemTypeMap.set( PAGEType, new VFItemType( PAGEType, 'pages', '.page', 'controller="${className}"', 'plum' ) );
    itemTypeMap.set( FLOWType, new ItemType( FLOWType, 'flow', '.flow', null, 'pink' ) );  // ?

    class ItemData {
        constructor( aName, anItemType, filePath ) {
            this.name = aName;
            this.itemType = anItemType;
            this.uniqueName = `${aName}-${anItemType.type}`;
            this.filePath = filePath;
            this.references = [];
            this.referencedCount = 0;
            this.methodReferencesSet = new Set();
            this.publicName = this.name +' '+ anItemType.type;
            this.additionalInfo = '';
            this.componentName = anItemType.getComponentName( aName );
        }
        getItemTextFromFile = () => {
            // read file
            let itemText = this.getFile( this.filePath );
            
            // JS items have an additional .js file
            let itemTextJS = '';
            if( this.itemType.hasJS ) {
                let filePathJS = this.filePath.replace( this.itemType.extension, '.js' );
                itemTextJS = this.getFile( filePathJS );

                // try again finding a controller
                filePathJS = this.filePath.replace( this.itemType.extension, 'Controller.js' );
                let itemTextControllerJS = this.getFile( filePathJS );

                // try again finding a helper
                filePathJS = this.filePath.replace( this.itemType.extension, 'Helper.js' );
                let itemTextHelperJS = this.getFile( filePathJS );

                itemTextJS = itemTextJS
                            + itemTextControllerJS
                            + itemTextHelperJS;
            }
            return itemText
                +'////\n'+ itemTextJS;
        }
        getFile = ( filePath ) => {
            if( fs.existsSync( filePath ) ) {
                if( verboseFlag ) {
                    console.log( `Reading ${this.itemType.type}:  ${this.name} at ${filePath}` );
                }
                return fs.readFileSync( filePath, 'utf8' );
            }
            return '';
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
                        .replace( '\';', '' )
                        .replace( 'controller="', '' )
                        .replace( '"', '' ) );
                } );
            }
    
            return methodReferenceSet;
        }
        getFormattedMethodReferenceStringList = () => {
            if( !this.methodReferencesSet || this.methodReferencesSet.size === 0 ) {
                return `(${this.publicName})`;
            }
    
            // concatenate method list with line breaks
            let methodReferencesText = [...this.methodReferencesSet].reduce( 
                ( prev, next ) => prev + '<br>' + next, ''
            );

            return `(${this.publicName}<br>${methodReferencesText})`;
        }
    }

// MAIN

// skip first 2 elements:  node and path
const myArgs = process.argv.slice( 2 );

// set proper folder location
let projectFolder = myArgs[ 0 ];
let mainProjectFolder = projectFolder;
projectFolder = getAdjustedProjectFolder( projectFolder );
if( projectFolder == null ) {
    return;
}

let lowerCaseArgs = myArgs.map( param => param.toLowerCase() );
let triggerFlag = lowerCaseArgs.includes( '--trigger' );
let lwcFlag = lowerCaseArgs.includes( '--lwc' );
let auraFlag = lowerCaseArgs.includes( '--aura' );
let flowFlag = lowerCaseArgs.includes( '--flow' );
let vfpageFlag = lowerCaseArgs.includes( '--visualforce' ) || lowerCaseArgs.includes( '--vf' );
let classFlag = !triggerFlag && !lwcFlag && !auraFlag && !flowFlag && !vfpageFlag;

let verboseFlag = myArgs.includes( '--verbose' );

let crossReferenceMap = new Map();

// collect file paths for each of the item types
itemTypeMap.forEach( ( itemType ) => {
    let itemListForType = itemType.getItemList( projectFolder );
    if( itemListForType == null ) {
        return;
    }

    // store list of files per each type
    itemType.itemsList = [ ...itemListForType ];

    // check the contents of each item/file
    itemType.itemsList.forEach( currentItem => {
        if( ! currentItem ) {
            return;
        }

        let itemText = currentItem.getItemTextFromFile();
        if( ! itemText ) {
            return;
        }

        // identify the references the current item has to a LWC or Aura and store in map
        if( ( lwcFlag && itemType.type === LWCType ) 
                || ( auraFlag && itemType.type === AURAType ) 
                || ( vfpageFlag && itemType.type === PAGEType ) ) {
            let anItemList = itemTypeMap.get( itemType.type ).itemsList;
            anItemList.forEach( anItem => {
                if( ! anItem || anItem.uniqueName == currentItem.uniqueName
                        || ! itemText.includes( anItem.componentName ) ) {
                    return;
                }

                // increase referenced count
                anItem.referencedCount++;
                
                // store referenced class in xref map
                crossReferenceMap.set( anItem.name, anItem );

                // TODO:  store the interface of the item (public methods/attributes) and what sObjects it references

                // add lwc to the references list of the outer item
                currentItem.references.push( anItem );
            } );
        }

        // identify the references the current item has to a class and store in map
        let classItemList = itemTypeMap.get( CLASSType ).itemsList;
        classItemList.forEach( innerclass => {
            if( innerclass.uniqueName == currentItem.uniqueName
                    || ! itemText.includes( innerclass.componentName ) ) {
                return;
            }

            // detect and collect method calls in a set
            let methodReferencesSet = currentItem.getReferenceSet( itemText, innerclass.name );
            // commented out because not all method references are detected
            // if( methodReferencesSet.size == 0 ) {
            //     return;
            // }

            // add method to inner class record without duplicates
            if( methodReferencesSet.size > 0 ) {
                innerclass.methodReferencesSet.add( ...methodReferencesSet );
            }

            // TODO:  store the interface of the item (public methods/attributes) and what sObjects it references

            // increase referenced count
            innerclass.referencedCount++;

            // store referenced class in xref map
            crossReferenceMap.set( innerclass.name, innerclass );

            // add class to the references list of the outer item
            currentItem.references.push( innerclass );
        } );

        // store item in xref map
        crossReferenceMap.set( currentItem.name, currentItem );

    } );
} );

// sort map of classes by their referenced count (descending) + count of references to other classes
sortedClassReferenceArray = [...crossReferenceMap.values()].sort( 
        (a, b) => b.referencedCount + b.references.length - a.referencedCount - a.references.length );

// list classes and their references in mermaid format inside HTML
console.log( "Composing dependency graph..." );
let graphDefinition = 'graph LR\n';
let elementsWithMoreRefs = [];
let triggerList = [];
let independentItemList = [];
let listByType = new Map();
sortedClassReferenceArray.forEach( anItem => {

    // skip elements that were not specified in the command line
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
    if( vfpageFlag && anItem.itemType.type != PAGEType ) {
        return;
    }

    // display items that do not have dependencies as a single shape
    if( !anItem.references || anItem.references.length == 0 ) {
        independentItemList.push( `${anItem.publicName}` );
        // return; // removed because it makes some items not colored
    }

    // highlight in orange items that dependend on 6+ other items
    if( anItem.references.length >= 6 ) {
        elementsWithMoreRefs.push( anItem.uniqueName );

    } else {
        // add class to list segregated by type for the purpose of coloring
        let list = listByType.get( anItem.itemType.type );
        list = ( list ? list : [] );
        list.push( anItem.uniqueName );
        listByType.set( anItem.itemType.type, list );
    }

    // prepare text for Mermaid output (dependency graph)
    anItem.references.forEach( aReference => {
        // TODO:  fix this:  if this reference is added with the methodList initially 
        // and added again as referencer (hence without the methodList), 
        // the methodList on the first instance is omitted from the graph
        // potential solution:  add it again with the methodList at the end

        // add class dependency to the graph in Mermaid notation
        let methodList = aReference.getFormattedMethodReferenceStringList();
        
        // encode flow from a dependant item to a referenced item
        let dependencyFlow = `${anItem.uniqueName}(${anItem.publicName}) --> ${aReference.uniqueName}${methodList}\n`;
        graphDefinition += dependencyFlow;

        // if( verboseFlag ) {
        //     console.log( `graphDefinition with dependencies:`, dependencyFlow );
        // }
    } );

    // prepare Mermaid output for items that don't have dependencies but are referenced by other items
    if( anItem.references.length == 0 && anItem.referencedCount > 0 ) {
        let dependencyFlow = `${anItem.uniqueName}(${anItem.publicName})\n`;
        graphDefinition += dependencyFlow;
    }
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

let fullPath = projectFolder.replace( '/force-app', '' )
                            .replace( '/main', '' )
                            .replace( '/default', '' );

let theHeader = ( triggerFlag ? 'Triggers ' : '' )
                + ( lwcFlag ? 'LWCs ' : '' )
                + ( auraFlag ? 'Aura Components ' : '' )
                + ( flowFlag ? 'Flows ' : '' )
                + ( classFlag ? 'Apex Classes ' : '' )
                + ( vfpageFlag ? 'Visualforce Pages ' : '' )
            + 'Dependency Graph for ' + fullPath;

let graphHTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
            + `</head><body><h2>${theHeader}</h2><div id="theGraph" class="mermaid">\n`
            + graphDefinition
            + independentItemElement
            + styleSheetList
            +'</div><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>'
            + '<script>mermaid.initialize({startOnLoad:true,securityLevel:\'loose\'}); '
            + 'setTimeout( () => { var theGraph = document.querySelector("#theGraph SVG"); '
            + 'theGraph.setAttribute("height","100%"); }, 1000 );</script></body></html>';

// save HTML page with dependency graph
fs.writeFileSync( './dependencyGraph.html', graphHTML );
console.log( 'File dependencyGraph.html written successfully' );

// open browser with dependency graph
const open = require('open');
(async () => {
    await open( './dependencyGraph.html' , {wait: false} );
    console.log( 'The dependency graph should now display on the browser (scroll down if needed)' );
}) ();
