/*
 * Usage:
 * case 1.
 *     var mdcmd = require("mdcmd")
 *     mdcmd.setSACMHost("*.sacm.jp")
 *     mdcmd.executeMdCommand(tsa, sa, apikey, apisecret,
 *       "show system", 10, function(result) {
 *       // do something with result
 *     }
 *
 * case 2.
 *     var mdcmd = require("mdcmd")
 *     mdcmd.setSACMHost("*.sacm.jp")
 *     mdcmd.dispatchMdCommand(tsa, sa, apikey, apisecret,
 *       "show system", 10,j function(module_id) {
 *       mdcmd.fetchResult(tsa, sa, apikey, apisecret, module_id,
 *         function(result) {
 *         // do something with result
 *       }
 *     });
 *
 */

var sacmHost = "*.sacm.jp"

var getHost = function() {
  return sacmHost;
};

exports.setSACMHost = function(host) {
  sacmHost = host;
};

exports.dispatchMdCommand = function(tsa, sa, apikey, apisecret, cmd, cb) {
  var formData = require("form-data");
  var form = new formData();
  var https = require("https");

  var request = https.request({
    method: 'post',
    host: getHost(),
    path: '/public-api/v1/user/' + tsa + '/request/md-command',
    auth: apikey + ':' + apisecret,
    headers: form.getHeaders()
  });

  form.append('0/plain', cmd);
  form.append('code', sa);
  form.append('targetTime', ''); // not supported

  form.pipe(request);

  console.log("dispatchMdCommand: dispatched command = " + cmd);

  var received_chunks = '';
  request.on('response', function(resp) {
    resp.on("data", function(chunk) {
      received_chunks += chunk;
    });

    resp.on("end", function() {
      json = JSON.parse(received_chunks);
      console.log("dispatchMdCommand: issued id = " + json['id']);
      cb(json['id']); /* returns only id */
    });
  });

  ret = request.end();
};

exports.fetchResult = function(tsa, sa, apikey, apisecret, id, cb) {

  var https = require('https');
  var req = https.request({
    method: 'get',
    host: getHost(),
    path: '/public-api/v1/user/' + tsa + '/request/md-command/' + id + '/result/module/0/plain',
    auth: apikey + ':' + apisecret
  });

  req.on('response', function(resp) {
    var received_chunks = '';
    resp.on('data', function(chunk) {
      received_chunks += chunk;
    });
    resp.on('end', function() {
      cb(received_chunks);
    });
  });
  req.on('error', function(e) {
    console.log("fetchResult: failed with " + e.message);
    cb({"error": e.message});
  });

  req.end();
};

exports.executeMdCommand = function(tsa, sa, apikey, apisecret, cmd, timeout, cb) {
  exports.dispatchMdCommand(tsa, sa, apikey, apisecret, cmd, function(id) {
    var count = 0;
    var done = false;

    var timer = setInterval(function() {
      count++;

      if (done == true) {
        clearInterval(timer);
        return;
      }
      if (count >= timeout) {
        clearInterval(timer);
        cb({'error': 'command timeout'});
        return;
      }

      console.log("executeMdCommand: " + count + " th attempts for fetching " + id);
      exports.fetchResult(tsa, sa, apikey, apisecret, id, function(resp) {
        if (typeof resp == "object" && 'error' in resp) {
          clearInterval(timer);
          cb(resp);
          return;
        }

        if (resp == "" || resp.length == 0) {
          return;
        }

        var obj = {}
        try {
          obj = JSON.parse(resp)
          if ('error' in obj) {
            console.log("executeMdCommand ERROR: failed to fetch result = " + obj.status + " " + obj.error);
            clearInterval(timer);
            cb(obj);
            return;
          }
        } catch(e) {
          /* maybe text */
        }

        console.log("executeMdCommand: fetched result = " + resp);
        clearInterval(timer);
        cb(resp);
        done = true
      });
    }, 1000);
  });
};
