# Dependency Finder for Salesforce

Node JS tool that scans the /force-app/main/default folder containing classes, lwc, aura, triggers and opens the browser with a page displaying the dependency graph between these elements.

## USAGE:
to show class dependencies
    node ./dependencyGraph.js myProjectFolder 

to show trigger vs class dependencies
    node ./dependencyGraph.js myProjectFolder --trigger

to show lwc vs class dependencies
    node ./dependencyGraph.js myProjectFolder --lwc

(NOT YET IMPLEMENTED) to show aura components vs class dependencies
    node ./dependencyGraph.js myProjectFolder --aura

(NOT YET IMPLEMENTED) to show flow vs class dependencies
    node ./dependencyGraph.js myProjectFolder --flow
