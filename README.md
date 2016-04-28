# Remote Debugging Protocol Reload Assets

## Installation

```console
$ npm install codajs/rdbgp-hotpatch
```

## Usage

```javascript
var rdbgp = require('rdbgp');
var reloadassets = require('rdbgp-reloadassets');

var client = rdbgp.connect();

var options = {
  // Optional, function used to resolve urls into filepaths.
  // The default resolves relative to the current working directory.
  resolve: function (url, callback) {
  }, 
};

reloadassets(client, options);
```

## License

MIT.
