# Ship criteria

The release is shippable only when the final release-candidate commit has green CI and CodeQL, the packed artifact works in a clean consumer project, and registry publication can be authenticated under the NullSquare npm scope.
