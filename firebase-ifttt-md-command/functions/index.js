'use strict';

const functions = require('firebase-functions');

var mdcmd = require("./mdcmd.js");

/* 以下のパラメータはお使いのSACM, SAに合わせてご変更ください */
const tsa = "tsaXXXXXXXX";
const sacode = "tswXXXXXXXX";
const apikey = "Access Key";
const apisecret = "Access Key Secret";
const sacmhost = "trial.sacm.jp" /* 例として検証用SACM https://dev.smf.jp/sacm/ を指定しています */

exports.sacmMdCommandAction = functions.https.onRequest((request, response) => {
  var cmd;

  if (typeof request != "object") {
    response.status(400).send("Invalid request");
    response.end()
    return;
  }

  cmd = request["cmd"];
  if (typeof cmd == "undefined" || cmd.length == 0) {
    cmd = "show log debug";
  }

  mdcmd.setSACMHost(sacmhost);

  mdcmd.executeMdCommand(tsa, sacode, apikey, apisecret, cmd, 10, function(result) {
    console.log("done command");
    response.status(200).send(result);
  });
});
