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

        return null;
    }

    class ItemType {
        hasJS = false;
        hasMultipleEntries = false;
        constructor( type, folder, extension, color ) {
            this.type = type;
            this.folder = folder;
            this.extension = extension;
            this.color = color;
        }
        getComponentName( aName ) {
            return aName;
        }
        validateFileName( fileName ) {
            return ! fileName.startsWith( '.' )
                    && ! fileName.toLowerCase().includes( 'test' ) 
                    && fileName.endsWith( this.extension );
        }
        readDirIfItExists( dirPath ) {
            let fileList;
            if( fs.existsSync( dirPath ) ) {
                fileList = fs.readdirSync( dirPath );
            }
            return ( fileList ? fileList : [] );
        }
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList = this.readDirIfItExists( path );
            
            fileList = fileList.filter( fileName => this.validateFileName( fileName ) );
    
            let itemList = fileList.map( fileName => { 
                return new ItemData( fileName.substring( 0, fileName.length - this.extension.length )
                                , this
                                , `${path}/${fileName}` );
            } );
    
            return itemList;
        }
        findReference( theText, itemName ) {
            // finds references to a class within another class:  new className() or className.methodName()
            const instantiationExpression = `new ${itemName}\\(`;
            let reMatchReferences = new RegExp( instantiationExpression, 'g' );
            let foundClassInstantiation = theText.match( reMatchReferences );

            reMatchReferences = new RegExp( `${itemName}\\.[^ <>]*?\\(`, 'g' );
            let foundStaticMethodCall = theText.match( reMatchReferences );

            // finds references to a flow within a class:  Flow.Interview.flowName
            const flowRefExpression = `Flow.Interview.${itemName}`;
            reMatchReferences = new RegExp( flowRefExpression, 'g' );
            let foundFlowReference = theText.match( reMatchReferences );

            let foundReferences = foundClassInstantiation ? foundClassInstantiation : [];
            foundReferences = foundReferences.concat( foundStaticMethodCall ? foundStaticMethodCall : [] );
            foundReferences = foundReferences.concat( foundFlowReference ? foundFlowReference : [] );

            // clean up the references
            foundReferences = foundReferences.map( ( aReference ) => {
                return aReference.replace( `${itemName}.`, '' ).replace( '(', '' ).replace( /\..*/gi, '' )
                                            .replace( instantiationExpression, 'instantiation' )
                                            .replace( `new ${itemName}`, 'instantiation' )
                                            .replace( flowRefExpression, 'flow' );
            } );
            //console.log( `Found ${foundReferences.length} references to ${itemName}`, foundReferences );
            return foundReferences;
        }
        fetchItemsFromFolder() {
            if( this.itemsList ) {
                return this.itemsList;
            }
            let itemListForType = this.getItemList( projectFolder );
            if( itemListForType == null ) {
                return;
            }

            // store list of files per each type
            this.itemsList = itemListForType;

            return this.itemsList;
        }
    }
    class JSItemType extends ItemType {
        hasJS = true;
        getComponentName( aName ) {
            let componentName = aName;
            // NOTE:  didn't want to subclass JSItemType further to get rid of these ifs
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

            let subfolderList = this.readDirIfItExists( path );
            if( subfolderList.length === 0 ) {
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
        findReference( theText, itemName ) {
            // finds references to a class within a LWC/Aura/VF:  controller="className" or import...from '@...className'
            const controllerRefExpression = `controller="${itemName}"`;
            let reMatchReferences = new RegExp( controllerRefExpression, 'g' );
            let foundControllerReference = theText.match( reMatchReferences );

            const importRefExpression = `import .*? from \\'@salesforce/apex/${itemName}.(.*?)\\';`;
            reMatchReferences = new RegExp( importRefExpression, 'g' );
            let foundLWCImport = theText.match( reMatchReferences );

            let foundReferences = foundControllerReference ? foundControllerReference : [];
            foundReferences = foundReferences.concat( foundLWCImport ? foundLWCImport : [] );

            // clean up the references
            foundReferences = foundReferences.map( ( aReference ) => {
                return aReference.replace( controllerRefExpression, 'controller' )
                                        .replace( /';/g, '' )
                                        .replace( /import .*? from '@salesforce\/apex\/.*?\./g, 'imported' );
            } );
            //console.log( `Found ${foundReferences.length} references to ${itemName}`, foundReferences );
            return foundReferences;
        }
    }
    class VFItemType extends ItemType {
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList = this.readDirIfItExists( path );

            // include VF components too
            console.log( `Looking for /components in folder:  ${projectFolder}` );
            let componentPath = `${projectFolder}/components`;
            let componentFileList = this.readDirIfItExists( componentPath );
            if( componentFileList.length > 0 ) {
                fileList.push( ...componentFileList );
            }

            if( fileList.length === 0 ) {
                return null;
            }
            
            fileList = fileList.filter( fileName => ! fileName.startsWith( '.' )
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
    class FlowItemType extends ItemType {
        validateFileName( fileName ) {
            return ! fileName.startsWith( '.' )
                && fileName.endsWith( this.extension );
        }
        // findReference( theText, itemName ) {
        //     // finds references to a flow within a class:  Flow.Interview.flowName
        //     const flowRefExpression = `Flow.Interview.${itemName}`;
        //     let reMatchReferences = new RegExp( flowRefExpression, 'g' );
        //     let foundFlowReference = theText.match( reMatchReferences );

        //     //console.log( `Found ${foundReferences.length} references to ${itemName}`, foundReferences );
        //     return foundFlowReference;
        // }
    }
    class WorkflowItemType extends FlowItemType {
        hasMultipleEntries = true;
        // TODO:  reimplement getItemList() to retrieve each object's workflows and extract from them
        // the individual workflow items (rules, time-triggers, alerts, field updates, etc.)
        getItemList = ( projectFolder ) => {
            // collect items in folder
            console.log( `Looking for /${this.folder} in folder:  ${projectFolder}` );
            let path = `${projectFolder}/${this.folder}`;
            let fileList = this.readDirIfItExists( path );
            
            fileList = fileList.filter( fileName => this.validateFileName( fileName ) );
    
            // create one item for the rule and each of the workflow action types
            let itemList = [];
            fileList.forEach( fileName => { 
                let itemName = fileName.substring( 0, fileName.length - this.extension.length );
                let filePath = `${path}/${fileName}`;
                itemList.push( new ItemData( `${itemName} WF ALERT`, this, filePath ) );
                itemList.push( new ItemData( `${itemName} WF OUTBOUND MSG`, this, filePath ) );
                itemList.push( new ItemData( `${itemName} WF TASK`, this, filePath ) );
                itemList.push( new ItemData( `${itemName} WF FIELD UPDATE`, this, filePath ) );
                itemList.push( new ItemData( `${itemName} WF RULE`, this, filePath ) );
            } );
    
            return itemList;
        }
    }

    const CLASSType = 'CLASS', TRIGGERType = 'TRIGGER', AURAType = 'AURA', LWCType = 'LWC'
        , FLOWType = 'FLOW', WORKFLOWType = 'WORKFLOW', PAGEType = 'VISUALFORCE'; // PROCESSBUILDERType = 'PBFLOW?'
    const itemTypeMap = new Map();
    itemTypeMap.set( CLASSType, new ItemType( CLASSType, 'classes', '.cls', 'lightblue' ) );
    itemTypeMap.set( TRIGGERType, new ItemType( TRIGGERType, 'triggers', '.trigger', 'cyan' ) );
    itemTypeMap.set( AURAType, new JSItemType( AURAType, 'aura', '.cmp', 'yellow' ) );
    itemTypeMap.set( LWCType, new JSItemType( LWCType, 'lwc', '.html', 'lightgreen' ) );
    itemTypeMap.set( PAGEType, new VFItemType( PAGEType, 'pages', '.page', 'plum' ) );
    itemTypeMap.set( FLOWType, new FlowItemType( FLOWType, 'flows', '.flow-meta.xml', 'pink' ) );
    itemTypeMap.set( WORKFLOWType, new WorkflowItemType( WORKFLOWType, 'workflows', '.workflow-meta.xml', 'gray' ) );

    class ItemData {
        constructor( aName, anItemType, filePath ) {
            this.name = aName;
            this.itemType = anItemType;
            // this is for when a class and another item have the same name
            this.uniqueName = `${aName}-${anItemType.type}`;
            this.filePath = filePath;
            this.references = [];
            this.referencedCount = 0;
            this.methodReferencesSet = new Set();
            this.additionalInfo = '';
            // this is to display the item in the graph
            this.displayName = `${aName} ${anItemType.type}`;
            // componentName is really a "expression to look for when checking if this item is referenced"
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

                return `${itemText}////\n${itemTextJS}////\n${itemTextControllerJS}////\n${itemTextHelperJS}`;
            }

            if( this.itemType.hasMultipleEntries ) {
                let workflowType = this.name.substring( this.name.indexOf( ' ' ) + 1 );
                let refExpression;
                if( workflowType === 'WF ALERT' ) {
                    refExpression = '<alerts>.*?</alerts>';
                }
                if( workflowType === 'WF OUTBOUND MSG' ) {
                    refExpression = '<outboundMessages>.*?</outboundMessages>';
                }
                if( workflowType === 'WF TASK' ) {
                    refExpression = '<tasks>.*?</tasks>';
                }
                if( workflowType === 'WF FIELD UPDATE' ) {
                    refExpression = '<fieldUpdates>.*?</fieldUpdates>';
                }
                if( workflowType === 'WF RULE' ) {
                    refExpression = '<rules>.*?</rules>';
                }
                let reMatchReferences = new RegExp( refExpression, 'gs' );
                let foundControllerReference = itemText.match( reMatchReferences );
                return ( foundControllerReference ? foundControllerReference.join() : '' );
            }

            return itemText;
        }
        getFile = ( aFilePath ) => {
            if( ! fs.existsSync( aFilePath ) ) {
                return '';
            }
            if( verboseFlag ) {
                console.log( `Reading ${this.itemType.type}:  ${this.name} at ${aFilePath}` );
            }
            return fs.readFileSync( aFilePath, 'utf8' );
        }
        getReferenceSet = ( theText, className ) => {
            let foundReferences = this.itemType.findReference( theText, className );

            let methodReferenceSet = new Set();
            if( foundReferences && foundReferences.length > 0 ) {
                methodReferenceSet.add( ...foundReferences );
            }
            //console.log( 'methodReferenceSet', methodReferenceSet );
    
            return methodReferenceSet;
        }
        getFormattedMethodReferenceStringList = () => {
            if( !this.methodReferencesSet || this.methodReferencesSet.size === 0 ) {
                return `(${this.displayName})`;
            }
    
            // concatenate method list with line breaks
            let methodReferencesText = [...this.methodReferencesSet].reduce( 
                ( prev, next ) => prev + '<br>' + next, ''
            );

            return `(${this.displayName}<br>${methodReferencesText})`;
        }
    }

// MAIN

// skip first 2 elements:  node and path
const myArgs = process.argv.slice( 2 );

// set proper folder location according to first parameter
let projectFolder = myArgs[ 0 ];
projectFolder = getAdjustedProjectFolder( projectFolder );
if( !projectFolder ) {
    console.log( 'Error:  Specify a folder containing project files.' );
    return;
}

// determine which parameter flags were passed
let lowerCaseArgs = myArgs.map( param => param.toLowerCase() );
let triggerFlag = lowerCaseArgs.includes( '--trigger' );
let lwcFlag = lowerCaseArgs.includes( '--lwc' );
let auraFlag = lowerCaseArgs.includes( '--aura' );
let flowFlag = lowerCaseArgs.includes( '--flow' );
let vfpageFlag = lowerCaseArgs.includes( '--visualforce' ) || lowerCaseArgs.includes( '--vf' );
let workflowFlag = lowerCaseArgs.includes( '--workflow' );
let classFlag = !triggerFlag && !lwcFlag && !auraFlag && !flowFlag && !vfpageFlag && !workflowFlag;

let verboseFlag = myArgs.includes( '--verbose' );

// this is the basis of the dependency graph
let crossReferenceMap = new Map();

// collect file paths for each of the item types and collect references in each file
itemTypeMap.forEach( ( itemType ) => {
    let itemListForType = itemType.fetchItemsFromFolder()
    // let itemListForType = itemType.getItemList( projectFolder );
    if( itemListForType == null ) {
        return;
    }

    // // store list of files per each type
    // itemType.itemsList = itemListForType;

    // check the contents of each item/file
    itemListForType.forEach( currentItem => {
        if( ! currentItem ) {
            return;
        }

        let itemText = currentItem.getItemTextFromFile();
        if( ! itemText ) {
            return;
        }

        // identify the references the current item has to a LWC/Aura/VF and store in map
        // if LWC flag was specified, it will attempt to find LWCs in the file and so forth
        // for Flows, it will look for references in other flows and classes too
        if( ( lwcFlag && itemType.type === LWCType ) 
                || ( auraFlag && itemType.type === AURAType ) 
                || ( vfpageFlag && itemType.type === PAGEType ) 
                || ( flowFlag && itemType.type === FLOWType )
                || ( workflowFlag && itemType.type === WORKFLOWType ) ) {

            let anItemList = itemTypeMap.get( itemType.type ).itemsList;
            anItemList.forEach( anItem => {
                if( ! anItem || anItem.uniqueName == currentItem.uniqueName
                        || ! itemText.includes( anItem.componentName ) ) {
                    return;
                }

                // detect and collect method calls in a set
                let methodReferencesSet = currentItem.getReferenceSet( itemText, anItem.name );
                if( methodReferencesSet.size > 0 ) {
                    // add method to inner class record without duplicates
                    anItem.methodReferencesSet.add( ...methodReferencesSet );
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

        if( ( workflowFlag && itemType.type === WORKFLOWType ) ) {
            let anItemList = itemTypeMap.get( itemType.type ).itemsList;
            anItemList.forEach( anItem => {
                if( ! anItem || anItem.uniqueName == currentItem.uniqueName ) {
                    return;
                }

                // itemText will be an array for workflow items
                console.log( 'itemText', itemText );
                if( ! Array.isArray( itemText ) ) {
                    itemText = [ itemText ];
                }
                itemText.forEach( aText => {
                    if( ! aText.includes( anItem.componentName ) ) {
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
            } );
        }

        // this would make class-flow dependencies visible but we need more to make classes visible only if they reference a flow
        // // check if any classes reference flows
        // if( ( flowFlag && itemType.type === CLASSType ) ) {
        //     //console.log( `Checking for flow references in class ${currentItem.uniqueName}` );
        //     let aFlowList = itemTypeMap.get( FLOWType ).fetchItemsFromFolder();
        //     aFlowList.forEach( aFlow => {
        //         //console.log( `Checking ${aFlow.uniqueName} in class ${currentItem.uniqueName}` );
        //         if( ! aFlow || aFlow.uniqueName == currentItem.uniqueName
        //                 || ! itemText.includes( aFlow.componentName ) ) {
        //             return;
        //         }
        //         console.log( ` ${aFlow.uniqueName} is in class ${currentItem.uniqueName}` );

        //         // increase referenced count
        //         aFlow.referencedCount++;
                
        //         // store referenced class in xref map
        //         crossReferenceMap.set( aFlow.name, aFlow );

        //         // TODO:  store the interface of the item (public methods/attributes) and what sObjects it references

        //         // add lwc to the references list of the outer item
        //         currentItem.references.push( aFlow );
        //     } );
        // }

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
            if( methodReferencesSet.size > 0 ) {
                // add method to inner class record without duplicates
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

// sort by descending order the classes by their referenced count + count of references to other classes
// to hopefully make the graph more legible
sortedClassReferenceArray = [...crossReferenceMap.values()].sort( 
        (a, b) => b.referencedCount + b.references.length - a.referencedCount - a.references.length );

// list classes and their references in mermaid format inside HTML
console.log( "Composing dependency graph..." );
let graphDefinition = '';
let elementsWithMoreRefs = [];
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
        // this would show classes that reference flows but also classes that reference other classes
        // && anItem.itemType.type != CLASSType ) {
        return;
    }
    if( vfpageFlag && anItem.itemType.type != PAGEType ) {
        return;
    }
    if( workflowFlag && anItem.itemType.type != WORKFLOWType ) {
        return;
    }

    // display items that do not have dependencies as a single shape
    if( !anItem.references || anItem.references.length == 0 ) {
        independentItemList.push( `${anItem.displayName}` );
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

    // prepare Mermaid output for dependencies
    anItem.references.forEach( aReference => {
        // TODO:  fix this:  if this reference is added with the methodList initially 
        // and added again as referencer (hence without the methodList), 
        // the methodList on the first instance is omitted from the graph
        // potential solution:  add it again with the methodList at the end

        // add class dependency to the graph in Mermaid notation
        let methodList = aReference.getFormattedMethodReferenceStringList();

        // TODO:  come up with a way to make the arrows display the methods they reference

        // TODO:  come up with a way to display tooltips
        
        // encode flow from a dependant item to a referenced item
        let dependencyFlow = `${anItem.uniqueName}(${anItem.displayName}) --> ${aReference.uniqueName}${methodList}\n`;
        graphDefinition += dependencyFlow;

        // if( verboseFlag ) {
        //     console.log( `graphDefinition with dependencies:`, dependencyFlow );
        // }
    } );

    // prepare Mermaid output for items that don't have dependencies but are referenced by other items
    if( anItem.references.length == 0 && anItem.referencedCount > 0 ) {
        let dependencyFlow = `${anItem.uniqueName}(${anItem.displayName})\n`;
        graphDefinition += dependencyFlow;
    }
} );

if( graphDefinition === '' ) {
    console.log( 'No cross-references found for the specified parameters.' );
    return;
}

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

// build page with everything and script to adjust height of graph
let graphHTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
            </head><body><h2>${theHeader}</h2><div id="theGraph" class="mermaid">\n
            graph LR\n${graphDefinition}${independentItemElement}${styleSheetList}
            </div><script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
            <script>mermaid.initialize({startOnLoad:true,securityLevel:\'loose\'}); 
            setTimeout( () => { var theGraph = document.querySelector("#theGraph SVG"); 
            theGraph.setAttribute("height","100%"); }, 1000 );</script></body></html>`;

// save HTML page with dependency graph
fs.writeFileSync( `${fullPath}/dependencyGraph.html`, graphHTML );
console.log( `File dependencyGraph.html written successfully on ${fullPath}` );

// open browser with dependency graph
const open = require('open');
(async () => {
    await open( `${fullPath}/dependencyGraph.html`, {wait: false} );
    console.log( 'The dependency graph should now display on the browser (scroll down if needed)' );
}) ();
