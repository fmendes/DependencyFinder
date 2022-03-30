# Dependency Finder for Salesforce

Node JS tool that scans the /force-app/main/default folder containing classes, lwc, aura, triggers then creates an HTML page containing the dependency graph between these elements (a new tab in the browser is automatically opened to display it).

## USAGE:

to show class dependencies

    node ./dependencyGraph.js myProjectFolder 

to show trigger vs class dependencies

    node ./dependencyGraph.js myProjectFolder --trigger

to show lwc vs class dependencies

    node ./dependencyGraph.js myProjectFolder --lwc

to show aura components vs class dependencies

    node ./dependencyGraph.js myProjectFolder --aura

to show Visualforce pages/components vs class dependencies

    node ./dependencyGraph.js myProjectFolder --vf

(NOT YET IMPLEMENTED) to show flow vs class dependencies

    node ./dependencyGraph.js myProjectFolder --flow
