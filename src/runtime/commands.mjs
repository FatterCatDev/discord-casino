import cmdPing from '../commands/ping.mjs';
import cmdStatus from '../commands/status.mjs';
import cmdBalance from '../commands/balance.mjs';
import cmdGiveChip from '../commands/givechip.mjs';
import cmdJob from '../commands/job.mjs';
import cmdHouseBalance from '../commands/housebalance.mjs';
import cmdHouseAdd from '../commands/houseadd.mjs';
import cmdMintChip from '../commands/mintchip.mjs';
import cmdHouseRemove from '../commands/houseremove.mjs';
import cmdBuyIn from '../commands/buyin.mjs';
import cmdTakeChips from '../commands/takechips.mjs';
import cmdCashOut from '../commands/cashout.mjs';
import cmdLeaderboard from '../commands/leaderboard.mjs';
import cmdGiveCredits from '../commands/givecredits.mjs';
import cmdTakeCredits from '../commands/takecredits.mjs';
import cmdSetGameLogChannel from '../commands/setgamelogchannel.mjs';
import cmdSetCashLog from '../commands/setcashlog.mjs';
import cmdSetRequestChannel from '../commands/setrequestchannel.mjs';
import cmdSetUpdateChannel from '../commands/setupdatech.mjs';
import cmdSetAutoBan from '../commands/setautoban.mjs';
import cmdRequestTimer from '../commands/requesttimer.mjs';
import cmdRequest from '../commands/request.mjs';
import cmdHelp from '../commands/help.mjs';
import cmdAddMod from '../commands/addmod.mjs';
import cmdRemoveMod from '../commands/removemod.mjs';
import cmdAddAdmin from '../commands/addadmin.mjs';
import cmdRemoveAdmin from '../commands/removeadmin.mjs';
import cmdStaffList from '../commands/stafflist.mjs';
import cmdDailySpin from '../commands/dailyspin.mjs';
import cmdRideBus from '../commands/ridebus.mjs';
import cmdBlackjack from '../commands/blackjack.mjs';
import cmdSlots from '../commands/slots.mjs';
import cmdRoulette from '../commands/roulette.mjs';
import cmdHoldem from '../commands/holdem.mjs';
import cmdDiceWar from '../commands/dicewar.mjs';
import cmdHorseRace from '../commands/horserace.mjs';
import cmdSetRake from '../commands/setrake.mjs';
import cmdSetMaxBet from '../commands/setmaxbet.mjs';
import cmdResetAllBalance from '../commands/resetallbalance.mjs';
import cmdSetCasinoCategory from '../commands/setcasinocategory.mjs';
import cmdKittenMode from '../commands/kittenmode.mjs';
import cmdVote from '../commands/vote.mjs';
import cmdNews from '../commands/news.mjs';
import cmdBeg from '../commands/beg.mjs';
import cmdEightBall from '../commands/eightball.mjs';
import cmdDebugVote from '../commands/debugvote.mjs';
import cmdDebugDspin from '../commands/debugdspin.mjs';
import cmdCartel from '../commands/cartel.mjs';
import cmdSetCartelShare from '../commands/setcartelshare.mjs';
import cmdCartelReset from '../commands/cartelreset.mjs';
import cmdCartelRaidDebug from '../commands/cartelraiddebug.mjs';
import cmdCartelWarehouseDebug from '../commands/cartelwarehousedebug.mjs';
import cmdSetCartelRate from '../commands/setcartelrate.mjs';
import cmdSetCartelXp from '../commands/setcartelxp.mjs';

export const SETTINGS_MUTATION_COMMANDS = new Set([
  'setgamelogchannel',
  'setcashlog',
  'setrequestchannel',
  'setupdatech',
  'setautoban',
  'requesttimer',
  'setmaxbet',
  'setrake',
  'setcasinocategory',
  'kittenmode'
]);

export const ACCESS_MUTATION_COMMANDS = new Set(['addmod', 'removemod', 'addadmin', 'removeadmin']);

export const commandHandlers = {
  ping: cmdPing,
  status: cmdStatus,
  balance: cmdBalance,
  beg: cmdBeg,
  job: cmdJob,
  givechip: cmdGiveChip,
  housebalance: cmdHouseBalance,
  houseadd: cmdHouseAdd,
  mintchip: cmdMintChip,
  houseremove: cmdHouseRemove,
  buyin: cmdBuyIn,
  takechips: cmdTakeChips,
  cashout: cmdCashOut,
  leaderboard: cmdLeaderboard,
  givecredits: cmdGiveCredits,
  takecredits: cmdTakeCredits,
  setgamelogchannel: cmdSetGameLogChannel,
  setcashlog: cmdSetCashLog,
  setrequestchannel: cmdSetRequestChannel,
  setupdatech: cmdSetUpdateChannel,
  setautoban: cmdSetAutoBan,
  requesttimer: cmdRequestTimer,
  request: cmdRequest,
  help: cmdHelp,
  addmod: cmdAddMod,
  removemod: cmdRemoveMod,
  addadmin: cmdAddAdmin,
  removeadmin: cmdRemoveAdmin,
  dailyspin: cmdDailySpin,
  stafflist: cmdStaffList,
  ridebus: cmdRideBus,
  blackjack: cmdBlackjack,
  slots: cmdSlots,
  roulette: cmdRoulette,
  holdem: cmdHoldem,
  dicewar: cmdDiceWar,
  horserace: cmdHorseRace,
  setrake: cmdSetRake,
  setmaxbet: cmdSetMaxBet,
  setcartelshare: cmdSetCartelShare,
  setcartelxp: cmdSetCartelXp,
  setcartelrate: cmdSetCartelRate,
  resetallbalance: cmdResetAllBalance,
  setcasinocategory: cmdSetCasinoCategory,
  cartelreset: cmdCartelReset,
  cartelraiddebug: cmdCartelRaidDebug,
  cartelwarehousedebug: cmdCartelWarehouseDebug,
  kittenmode: cmdKittenMode,
  vote: cmdVote,
  debugvote: cmdDebugVote,
  debugdspin: cmdDebugDspin,
  news: cmdNews,
  cartel: cmdCartel,
  '8ball': cmdEightBall
};
