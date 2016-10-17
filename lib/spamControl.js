var debug = require('debug')('loopback:ibmresearch:mixins:spamcontrol');
var _ = require('lodash');
var cache = require('memory-cache');
var LoopBackContext = require('loopback-context');

var SPAM_CONTROL_TTL = 20000;

var defaultOptions = {
  ttl: SPAM_CONTROL_TTL,
  unique: true,
  errorCode: 'TIME_ELAPSED_NOT_ENOUGH'
}

/**
 * Options:
 *    - ttl: Time to wait to create a new instance
 *    - unique: Only access to this model will be checked
 *    - errorCode: ErrorCode to generate,
 */
module.exports = function(Model, opts) {
  var modelName = Model.modelName;
  var app;
  var spamOptions = {};

  _.merge(spamOptions, defaultOptions, opts);

  if (!Model.app) {
    Model.on('attached', function(a) {
      app = a;

      configure();
    });
  } else {
    app = Model.app;
    configure();
  }

  function _initialize() {
    // Empty
  }

  function _getKey(instance, options, accessToken, cb) {
    var keys = [ 'SpamControl' ];
    if (options.unique) {
      keys.push(modelName);
    }
    if (accessToken) {
      var AccessToken = app.models.AccessToken;
      AccessToken.findById(accessToken, function(err, accessTokenModel) {
        if (err) {
          return cb(err)
        }
        keys.push(accessToken.userId);
        cb(err, keys.join(':'));
      });
    } else {
      cb(null, keys.join(':'));
    }
  }

  function _resolveOrError(ttl, next) {
      if (ttl <= 0) {
        return next();
      }
      return next({code: spamOptions.errorCode});
  }

  function _getAccessToken() {
    var loopbackCtx = LoopBackContext.getCurrentContext();
    // Get the current access token
    var accessToken = loopbackCtx && loopbackCtx.get('accessToken');
    if (!accessToken) {
      debug('AccessToken not found in context');
    }
    return accessToken;
  }

  function configure() {
    // Initialize
    debug('Cache Spam Control System (SCS) configure model %s: %j', modelName, spamOptions);
    _initialize();


    Model.observe('after save', function(ctx, next) {
      var accessToken = _getAccessToken();
      if (ctx.isNewInstance && ctx.instance && accessToken) {
        _getKey(ctx.instance, spamOptions, accessToken, function(err, key) {
          debug('After key: %s', key);
          cache.put(key, 'true', spamOptions.ttl);
          next();
        });
      } else {
        next();
      }
    });

    // Check Spam Control before create new object
    Model.observe('before save', function(ctx, next) {
      var accessToken = _getAccessToken();
      if (ctx.isNewInstance && ctx.instance && accessToken) {
        _getKey(ctx.instance, spamOptions, accessToken, function (err, key) {
          debug('Before key: %s', key);

          var cacheResult = cache.get(key);
          if (cacheResult) {
            return _resolveOrError(1, next);
          } else {
            next();
          }
        });
      } else {
        next();
      }
    });
  }

};