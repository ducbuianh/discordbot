var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var request = require("request");
var fs = require("fs");
var JSONStream = require('JSONStream');
var es = require('event-stream');

var STEAM_API = 'http://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/V001/?format=json&key=';
var NEWLINE = '\n';
var BLOCK = '```';

var liveMatches = [];

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
    setInterval(fetchLiveGames, 10*1000);
});

bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 5) == '!doto') {
        var args = message.substring(5).split(' ');
        var cmd = args[1];
        args = args.splice(0,1);

        switch(cmd) {
            case 'match':
                announce(channelID, createLiveMatchList());
                break;
            case 'live':
                announce(channelID, createLiveMatchStory(args[2]));
                break;
            case 'help':
                announce(channelID, createHelpMsg());
                break;
            default:
                announce(channelID, surroundWithBlock('No such command, type \'doto help\' to see available commands'));
                break;
         }
     }
});

function fetchLiveGames() {
	logger.info('Begin fetch.');
	var liveFetchedMatches = [];
	var stream = request(STEAM_API + auth.steam_api_key).on('error', function(err) {
        logger.error(err);
        announce(channelID, surroundWithBlock('Steam API currently down'));
    });
    var parser = JSONStream.parse(['result','games', true]);
                
    stream.pipe(parser);
    parser.on('data', function (obj) {
        if (!isEmptyObject(obj.radiant_team) && !isEmptyObject(obj.dire_team)) {
            liveFetchedMatches.push(obj);
        }
    });
    parser.on('end', function (obj) {
    	liveMatches = [];
    	liveMatches = liveFetchedMatches;
    	logger.info('End fetch.');
	});
}

function announce(channelID, msg) {
    bot.sendMessage({
        to: channelID,
        message: msg
    });
}

function createLiveMatchList() {
    if (liveMatches.length === 0) {
        return surroundWithBlock('No LIVE game at the moment');
    }
    var result = '';
    result += 'No  ID          Radiant vs Dire' + NEWLINE
    result += '--------------------------------------------' + NEWLINE;
    for (i = 0; i < liveMatches.length; i++) {
      result += addZeroToNumber(i+1) + '  ' + liveMatches[i].match_id + '  [' 
      + liveMatches[i].radiant_team.team_name + '] vs [' + liveMatches[i].dire_team.team_name + ']' + NEWLINE;
    }
    result = surroundWithBlock(result);
    return result;
}

function createLiveMatchStory() {
	return;
}

function createHelpMsg() {
    var helpMsg;
    helpMsg += 'Available Commands:' + NEWLINE;
    helpMsg += '   !doto match: show currently live games list' + NEWLINE;
    helpMsg += '   !doto live [matchid]/[No]: show current log of [matchid]';
    helpMsg = surroundWithBlock(helpMsg);
    return helpMsg;
}

function addZeroToNumber(num) {
	return (num<10)?'0'+num:''+num;
}

function surroundWithBlock(msg) {
	return BLOCK + NEWLINE + msg + NEWLINE + BLOCK;
} 

function isEmptyObject(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
};