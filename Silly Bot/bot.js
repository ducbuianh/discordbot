var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var request = require("request");
var fs = require("fs");
var hero = require('./hero.json');
var league = require('./league.json');
var JSONStream = require('JSONStream');
var es = require('event-stream');

var STEAM_API = 'http://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/V1/?format=json&key=';
var NEWLINE = '\n';
var BLOCK = '```';
var RADIANT = 0;
var DIRE = 1;
var regexNum = /^\d+$/;

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
    fetchLiveGames();
    setInterval(fetchLiveGames, 20*1000);
});

bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 5) == '!doto') {
        var args = message.substring(5).split(' ');
        var cmd = args[1];
        var param = args[2];

        switch(cmd) {
            case 'live':
                if (param == undefined || param == '') {
                    announce(channelID, createLiveMatchList());
                    break;
                }
                if (regexNum.test(param)) {
	                if (isEmptyObject(liveMatches)) {
	                    announce(channelID, surroundWithBlock('No LIVE game at the moment'));
	                    break;
	                }
	                announce(channelID, createLiveMatchStory(param));
            	}
                break;
            case 'help':
                announce(channelID, createHelpMsg());
                break;

            case 'test':
                for (var i = 0; i < hero.length; i++) {
                    logger.info(hero.localized_name);
                }
                break;
            default:
                break;
         }
     }
});

function fetchLiveGames() {
	logger.info('Begin fetch.');
	var liveFetchedMatches = [];
	var stream = request(STEAM_API + auth.steam_api_key).on('error', function(err) {
        logger.error(err);
    });
    var parser = JSONStream.parse(['result','games', true]);
                
    stream.pipe(parser);
    parser.on('data', function (obj) {
        if (isProMatch(obj)) {
            liveFetchedMatches.push(obj);
        }
    });
    parser.on('end', function (obj) {
    	liveMatches = [];
    	liveMatches = liveFetchedMatches;
    	logger.info('End fetch.');
	});
}

function isProMatch(match) {
    return (!isEmptyObject(match.radiant_team) && !isEmptyObject(match.dire_team) 
        && !isEmptyObject(match.scoreboard) && (match.league_id !== 0)
        && !isEmptyObject(match.scoreboard.radiant.picks)
        && !isEmptyObject(match.scoreboard.dire.picks));
}

function announce(channelID, msg) {
    bot.sendMessage({
        to: channelID,
        message: msg
    });
}

function createLiveMatchList() {
    var result = '';
    result += 'No  ID          Radiant vs Dire                 League      ' + NEWLINE
    result += '------------------------------------------------------------' + NEWLINE;
    for (var i = 0; i < liveMatches.length; i++) {
      result += addZeroToNumber(i+1) + space(2) 
      + liveMatches[i].match_id + space(2)
      + fillSpaceToLen('[' + trimToLen(liveMatches[i].radiant_team.team_name, 12) + '] vs [' + trimToLen(liveMatches[i].dire_team.team_name, 12) + ']', 32) + space(2)
      + trimToLen(getLeagueById(liveMatches[i].league_id), 12)
      + NEWLINE;
    }
    result = surroundWithBlock(result);
    return result;
}

function createLiveMatchStory(id) {
    if (id.length == 10) { //ref by Match ID
        for (var i = 0; i < liveMatches.length; i++) {
            if (liveMatches[i].match_id == id) {
                return createStory(liveMatches[i]);
            }
        }
    } else { //ref by No.
        return createStory(liveMatches[id-1]);
    }
	return 'No match with given ID';
}

function createStory(match) {
    if (match == undefined) return 'No match with given ID';
    
    var title = '[' + trimToLen(match.radiant_team.team_name, 12) + '] vs [' + trimToLen(match.dire_team.team_name, 12) + ']';
    if (match.scoreboard.duration > 0) {
        title += ' *LIVE at ' + getElapsedTime(match.scoreboard.duration) + '*';
    } else {
    	title += ' *in Banpick*';
    }
    var story = '';
    story += 'Game ' + (match.radiant_series_wins + match.dire_series_wins + 1) + ' of a BO' + (2 * match.series_type + 1) + NEWLINE;
    if (2 * match.series_type + 1 > 1) {
		story += 'Serie Score: ' + match.radiant_team.team_name + ' ' + match.radiant_series_wins + 
             ' - ' + match.dire_series_wins + ' ' + match.dire_team.team_name + NEWLINE; 
	}
    story += 'Game Score : ' + match.radiant_team.team_name + ' (Radiant) '+ match.scoreboard.radiant.score + 
             ' - ' + match.scoreboard.dire.score + ' (Dire) ' + match.dire_team.team_name + NEWLINE; 
    story += 'Lineup:' + NEWLINE;
    story += '    Radiant: ' + getLineUp(match, RADIANT) + NEWLINE;
    story += '    Dire   : ' + getLineUp(match, DIRE) + NEWLINE;
    story += 'Networth Advantage: ' + getNetworthAdv(match);
    return title + NEWLINE + surroundWithBlock(story);
}

function getNetworthAdv(match) {
	var radiantNet = getNetworth(match.scoreboard.radiant);
	var direNet = getNetworth(match.scoreboard.dire);
	logger.info (radiantNet);
	return (radiantNet >= direNet)?('Radiant +' + (radiantNet-direNet)):('Dire +' + (direNet-radiantNet));
}

function getNetworth(side) {
	var players = side.players;
	var net = 0;
	for (var i = 0; i < players.length; i++) {
		net += players[i].gold;
	}
	return net;
}

function getLineUp(match, side) {
    var lineup = '';
    var picks = (side == RADIANT)?match.scoreboard.radiant.picks:match.scoreboard.dire.picks;
    for (var i = 0; i < picks.length; i++) {
        lineup += getHeroNameById(picks[i].hero_id) + ', ' ;
    }
    lineup = lineup.substr(0, lineup.length - 2);
    return lineup;
}

function getHeroNameById(heroId) {
    for (var i = 0; i < hero.length; i++) {
        if (hero[i].id == heroId) return hero[i].localized_name;
    }
    return 'Ice Frog';
}

function getLeagueById(leagueId) {

    for (var i = 0; i < league.length; i++) {
        if (league[i].leagueid == leagueId) return league[i].name;
    }
    return 'Unknown';
}

function createHelpMsg() {
    var helpMsg;
    helpMsg += 'Available Commands:' + NEWLINE;
    helpMsg += 'Type "!doto live" to show live games list' + NEWLINE;
    helpMsg += 'Type "!doto live [matchid]/[No]" to show current status of [matchid]';
    helpMsg += 'Type "!doto help" to show this';
    helpMsg = surroundWithBlock(helpMsg);
    return helpMsg;
}

function getElapsedTime(time) {
    var timeBySec = Math.floor(time);
    return Math.floor(timeBySec/60) + 'm ' + (timeBySec - Math.floor(timeBySec/60)*60) + 's';
}

function addZeroToNumber(num) {
	return (num<10)?'0'+num:''+num;
}

function trimToLen(s, len) {
    return s.length>len?s.substring(0, len):s;
}

function space(len) {
    var s = '';
    for (var i = 0; i < len; i++) {
        s += ' ';
    }
    return s;
}

function fillSpaceToLen(s, len) {
    if (s.length < len) {
        s += space(len-s.length);
    }
    return s;
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