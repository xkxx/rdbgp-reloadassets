var srcsetParser = require('srcset');
var path = require('path');
var url = require('url');
var assetSelector = '[src], [srcset], [poster]';
var forEach = Array.prototype.forEach;
// https://www.w3.org/TR/CSS2/syndata.html#value-def-uri
var cssUrlPattern = /url\(\s*['"]?(.+?)['"]?\s*\)/gi;

var optionallyReloadUri = function(filename, uri) {
  var parsedUri = url.parse(uri, true);
  // conservative: reload all urls matching base filename
  // console.info(path.basename(filename), path.basename(parsedUri.pathname))
  if (path.basename(filename) == path.basename(parsedUri.pathname)) {
    parsedUri.search = null;
    parsedUri.query['timestamp'] = Date.now();
    return url.format(parsedUri);
  }
  else {
    return uri;
  }
};

var optionallyReloadSrcset = function(filename, srcset) {
  var parsedSrcset = srcsetParser.parse(srcset);
  var changed = false;
  parsedSrcSet.forEach(function(obj) {
    var newUri = optionallyReloadUri(filename, obj.url);
    if (newUri != obj.url) {
      obj.url = newUri;
      changed = true;
    }
  });

  return changed ? srcsetParser.stringify(parseSrcset) : srcset;
};

var optionallyReloadCssProp = function(filename, prop) {
  var changed = false;
  var newProp = prop.replace(cssUrlPattern, function(match, url) {
    var newUrl = optionallyReloadUri(filename, url);
    if (newUrl != url) {
      changed = true;
      return 'url("' + newUrl + '")';
    }
    else {
      return match;
    }
  });

  return changed ? newProp : prop;
};

var reloadRules = [
  ['src', optionallyReloadUri],
  ['poster', optionallyReloadUri],
  ['srcset', optionallyReloadSrcset]
];

var reloadDom = function(filename) {
  document.querySelectorAll(assetSelector).forEach(function(node) {
    reloadRules.forEach(function(rule) {
      var attr = rule[0];
      var func = rule[1];
      if (node.hasAttribute(attr)) {
        var val = node.getAttribute(attr);
        var newVal = func(filename, val);
        if (val != newVal) {
          console.info("reloading", newVal)
          node.setAttribute(attr, newVal);
        }
      }
    });
  });
};

var reloadCss = function(filename) {
  forEach.call(document.styleSheets, function(styleSheet) {
    forEach.call(styleSheet.cssRules || styleSheet.rules || [],
    function(cssRule) {
      forEach.call(cssRule.style || [], function(propName) {
        var val = cssRule.style.getPropertyValue(propName);
        var newVal = optionallyReloadCssProp(filename, val);
        if (val != newVal) {
          var prio = cssRule.style.getPropertyPriority(propName);
          console.info("reloading", newVal);
          cssRule.style.setProperty(propName, newVal, prio);
        }
      });
    });
  });
};

window.addEventListener('assetUpdate', function(e) {
  console.info(e);
  var localpath = e.detail.localpath;
  reloadDom(localpath);
  reloadCss(localpath);
});
