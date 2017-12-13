'use strict';

process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');

var mdcmd = require('./mdcmd.js');

/* DialogflowのIntentsのActionとして action_query_sa を指定 */
const SHOW_STATUS_ACTION = 'action_query_sa';
/* action_query_sa に紐付くパラメータとして sa_query_target を指定 */
const SA_QUERY_TARGET='sa_query_target';


/* 以下のパラメータはお使いのSACM, SAに合わせてご変更ください */
const tsa = 'tsaXXXXXXXX';
const sacode = 'tswXXXXXXX';
const apikey = 'Access Key';
const apisecret = 'Access Key Secret';
const sacmhost = 'trial.sacm.jp'; /* 例として検証用SACM https://dev.smf.jp/sacm/ を指定しています */


exports.sacmAction = functions.https.onRequest((request, response) => {
  console.log('Request received');
  const app = new App({request, response});
  console.log('Request headers: ' + JSON.stringify(request.headers));
  console.log('Request body: ' + JSON.stringify(request.body));

  function parse_result_client_num(result) {
    var json = JSON.parse(result)
    var sum = 0
    var txt = ''

    for (var key in json) {
      sum += json[key]['clients'];
    }

    txt = 'クライアントは ' + sum + '端末います';

    return txt
  }

  function parse_result_airtime(result) {
    var data = JSON.parse(result);
    var txt = '';
    var bandname = {
      '80211a': '5GHz帯',
      '80211g': '2.4GHz帯'
    };

    for (var band in bandname) {
      if (data[band] != undefined && data[band]['ifup'] == true) {
        var airtime = data[band]['air_time_occupancy'];
        txt += bandname[band] + 'のチャネル使用率は' + airtime[0]['bc']  + '% でした。';
        txt += 'ノイズは' + airtime[0]['other'] + '% でした。';
      }
    }

    return txt;
  }

  function parse_result_ping_google(result) {
    var lines = result.split('\n');
    var loss_line = lines[lines.length - 3];
    var rtt_line = lines[lines.length - 2];
    var rtt_ms = 0;
    var loss_rate = 0;
    var txt = '';
    var re;

    if (re = loss_line.match(/^(\d+) packets transmitted, (\d+) packets received, (\d+\.\d+)% packet loss$/)) {
      loss_rate = parseFloat(re[3]);
    }

    if (re = rtt_line.match((/= (\d+\.\d+)\//))) {
      rtt_ms = parseFloat(re[1]);
    }

    txt = 'GoogleへのRTTは' + rtt_ms + 'ミリ秒、ロス率は' + loss_rate + '%でした'
    return txt;
  }

  function round_2nd_decimal(val) {
    return Math.round(val * 100) / 100;
  }

  function parse_result_show_system(result) {
    var lines = result.split('\n')
    var obj = {
      'version': '不明',
      'cpu_usage': 0,
      'mem_usage': 0
    };

    for (var idx in lines) {
      var re = undefined;
      var line = lines[idx]

      if (re = line.match(/^Memory  : Total \d+\.\d+MB, Used \d+\.\d+MB \((\d+\.\d+)%\)/)) {
        obj['mem_usage'] = parseFloat(re[1]);
        continue;
      }
      if (re = line.match(/Idle (\d+\.\d+)%$/)) {
        obj['cpu_usage'] = round_2nd_decimal(100.0 - parseFloat(re[1]));
        continue;
      }
      if (re = line.match(/^SA-W(\d+) Ver. (\d+)\.(\d+) \((.+\d+)\)$/)) {
        obj['version'] = 'SA-W' + re[1] + ' ' + re[2] + '.' + re[3] + ' ' + re[4];
        continue;
      }
    }

    return obj;
  }

  function parse_result_show_system_version(result) {
    var system = parse_result_show_system(result);
    return 'SAのバージョンは' + system['version'] + 'です。'
  }

  function parse_result_show_system_cpu(result) {
    var system = parse_result_show_system(result);
    return 'CPU使用率は' + system['cpu_usage'] + '%です。'
  }

  function parse_result_show_system_mem(result) {
    var system = parse_result_show_system(result);
    return 'メモリ使用率は' + system['mem_usage'] + '%です。'
  }

  const keyword_matcher = {
    'クライアント数': {
      'cmd': 'show status wlan.client.count.json',
      'parser': parse_result_client_num
    },
    'チャネル使用率': {
      'cmd': 'show status wlan.air-time.occupancy.json',
      'parser': parse_result_airtime
    },
    'GoogleへのRTT': {
      'cmd': 'ping 8.8.8.8 count 2',
      'parser': parse_result_ping_google
    },
    'グーグルへのRTT': {
      'cmd': 'ping 8.8.8.8 count ',
      'parser': parse_result_ping_google
    },
    'SAのバージョン': {
      'cmd': 'show system',
      'parser': parse_result_show_system_version
    },
    'CPU使用率': {
      'cmd': 'show system',
      'parser': parse_result_show_system_cpu
    },
    'メモリ使用率': {
      'cmd': 'show system',
      'parser': parse_result_show_system_mem
    },
  }


  function parse_target(target, cmd, result, cb) {
    var txt = '';
    var func = keyword_matcher[target]['parser'];
    txt = func(result);
    cb(txt);
  }

  function sa_query (app) {
    console.log('sa_query in');
    var target = app.getArgument(SA_QUERY_TARGET);
    var cmd = '';

    console.log('target: "' + target + '"');

    if (keyword_matcher[target] == undefined) {
      app.tell(target + 'はサポートされていません');
      return;
    }

    cmd = keyword_matcher[target]['cmd'];

    mcdmd.setSACMHost(sacmhost);
    mdcmd.executeMdCommand(tsa, sacode, apikey, apisecret, cmd, 10, function(result) {
      if (typeof resp == 'object' && 'error' in result) {
        app.tell('おっと、不明なエラー ' + result['error'] + 'が発生しました');
        return;
      }
      parse_target(target, cmd, result, function(txt) {
        app.tell(txt);
      });
    });
  }

  let actionMap = new Map();
  actionMap.set(SHOW_STATUS_ACTION, sa_query);

  app.handleRequest(actionMap);
});
