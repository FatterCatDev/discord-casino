import {
  handleCartelOverviewRefresh,
  handleCartelRankTable,
  handleCartelGuide,
  handleCartelWarehouseView,
  handleCartelWarehouseBurnPrompt,
  handleCartelWarehouseBurnModal,
  handleCartelWarehouseExport,
  handleCartelWarehouseExportModal,
  handleCartelSharesView,
  handleCartelDealersView,
  handleCartelDealerHireTier,
  handleCartelDealerUpkeep,
  handleCartelDealerManageSelect,
  handleCartelDealerManageAction,
  handleCartelDealerPause,
  handleCartelDealerPauseAll,
  handleCartelDealerFire,
  handleCartelDealerFireAll,
  handleCartelDealerUpkeepModal,
  handleCartelShareOrderPrompt,
  handleCartelShareOrderModal,
  handleCartelShareOrderSelect,
  handleCartelShareOrderCancel,
  handleCartelMarketSelect,
  handleCartelMarketConfirm,
  handleCartelMarketModal,
  handleCartelSellPrompt,
  handleCartelSellModal,
  handleCartelSellMiniGameMove,
  handleCartelCollectPrompt,
  handleCartelCollectModal,
  handleCartelDealerCollect
} from '../commands/cartel.mjs';
import onHelpSelect from '../interactions/helpSelect.mjs';
import onHelpPageButtons from '../interactions/helpPageButtons.mjs';
import onRequestButtons from '../interactions/requestButtons.mjs';
import onRequestRejectModal from '../interactions/requestRejectModal.mjs';
import onJobStatusButtons from '../interactions/jobs/statusButtons.mjs';
import onJobShiftButtons from '../interactions/jobs/shiftButtons.mjs';
import onRideBusButtons from '../interactions/ridebusButtons.mjs';
import onBlackjackButtons from '../interactions/blackjackButtons.mjs';
import onSlotsButtons from '../interactions/slotsButtons.mjs';
import onDiceWarButtons from '../interactions/diceWarButtons.mjs';
import onRouletteButtons from '../interactions/rouletteButtons.mjs';
import onHorseRaceButtons from '../interactions/horseRaceButtons.mjs';
import onHoldemButtons from '../interactions/holdemButtons.mjs';
import onLeaderboardButtons from '../interactions/leaderboardButtons.mjs';
import onDailySpinButtons from '../interactions/dailyspinButtons.mjs';
import onRouletteTypeSelect from '../interactions/rouletteTypeSelect.mjs';
import onBlackjackBetModal from '../interactions/blackjackBetModal.mjs';
import onRouletteModal from '../interactions/rouletteModal.mjs';
import onHoldemBetModal from '../interactions/holdemBetModal.mjs';
import onHoldemJoinModal from '../interactions/holdemJoinModal.mjs';
import onHoldemCustomModal from '../interactions/holdemCustomModal.mjs';
import onHorseRaceBetModal from '../interactions/horseRaceBetModal.mjs';

export function createComponentRouter(buildCommandContext) {
  function routeComponent(interaction, ctxExtras) {
    if (interaction.isButton() && interaction.customId === 'cartel|refresh') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelOverviewRefresh(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|ranks') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelRankTable(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|guide') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelGuide(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|view') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'splash');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|view|buy') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'buy');
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|shares|view|buy|page|')) {
      const page = Number(interaction.customId.split('|').pop());
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'buy', { page: Number.isFinite(page) ? page : 1 });
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|view|sell') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'sell');
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|shares|view|sell|page|')) {
      const page = Number(interaction.customId.split('|').pop());
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'sell', { page: Number.isFinite(page) ? page : 1 });
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|view|posts') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSharesView(interaction, ctx, 'posts');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|order|sell') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelShareOrderPrompt(interaction, ctx, 'SELL');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|shares|order|buy') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelShareOrderPrompt(interaction, ctx, 'BUY');
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|shares|order|cancel|')) {
      const orderId = interaction.customId.substring('cartel|shares|order|cancel|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelShareOrderCancel(interaction, ctx, orderId);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|shares|market|buy|confirm|')) {
      const parts = interaction.customId.split('|');
      const orderId = parts.length > 5 ? parts[5] : '0';
      const page = parts.length > 6 ? Number(parts[6]) : 1;
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketConfirm(interaction, ctx, 'buy', orderId, page);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|shares|market|sell|confirm|')) {
      const parts = interaction.customId.split('|');
      const orderId = parts.length > 5 ? parts[5] : '0';
      const page = parts.length > 6 ? Number(parts[6]) : 1;
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketConfirm(interaction, ctx, 'sell', orderId, page);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|sell|prompt') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSellPrompt(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|sell|minigame|move|')) {
      const parts = interaction.customId.split('|');
      const direction = parts[4];
      const sessionId = parts[5] || '';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSellMiniGameMove(interaction, ctx, direction, sessionId);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|collect|prompt') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelCollectPrompt(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|overview') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelOverviewRefresh(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|warehouse|view') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelWarehouseView(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|warehouse|burn') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelWarehouseBurnPrompt(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|warehouse|export') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelWarehouseExport(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|dealers|view|')) {
      const view = interaction.customId.split('|').pop();
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealersView(interaction, ctx, view);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|dealers|hire|tier|')) {
      const tierId = Number(interaction.customId.split('|').pop());
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerHireTier(interaction, ctx, tierId);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|dealers|upkeep|')) {
      const dealerId = interaction.customId.substring('cartel|dealers|upkeep|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerUpkeep(interaction, ctx, dealerId);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|manage|fire') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerManageAction(interaction, ctx, 'fire');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|manage|pause') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerManageAction(interaction, ctx, 'pause');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|manage|unpause') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerManageAction(interaction, ctx, 'unpause');
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|pause_all') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerPauseAll(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|fire_all') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerFireAll(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId === 'cartel|dealers|collect') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerCollect(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|dealers|pause|dealer|')) {
      const dealerId = interaction.customId.substring('cartel|dealers|pause|dealer|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerPause(interaction, ctx, dealerId);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('cartel|dealers|fire|dealer|')) {
      const dealerId = interaction.customId.substring('cartel|dealers|fire|dealer|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerFire(interaction, ctx, dealerId);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('jobstatus|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onJobStatusButtons(interaction, ctx);
    }
    else if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('jobshift|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onJobShiftButtons(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('rb|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRideBusButtons(interaction, ctx);
    }
    // Blackjack buttons
    else if (interaction.isButton() && interaction.customId.startsWith('bj|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onBlackjackButtons(interaction, ctx);
    }
    // Slots buttons
    else if (interaction.isButton() && interaction.customId.startsWith('slots|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onSlotsButtons(interaction, ctx);
    }
    // Dice War buttons
    else if (interaction.isButton() && interaction.customId.startsWith('dice|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onDiceWarButtons(interaction, ctx);
    }
    // Roulette buttons
    else if (interaction.isButton() && interaction.customId.startsWith('rou|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRouletteButtons(interaction, ctx);
    }

    // Horse race buttons
    else if (interaction.isButton() && interaction.customId.startsWith('horse|')) {
      return onHorseRaceButtons(interaction);
    }

    // Hold'em buttons
    else if (interaction.isButton() && interaction.customId.startsWith('hold|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHoldemButtons(interaction, ctx);
    }

    // Request buttons
    else if (interaction.isButton() && interaction.customId.startsWith('req|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRequestButtons(interaction, ctx);
    }

    // Leaderboard buttons
    else if (interaction.isButton() && interaction.customId.startsWith('leader|')) {
      return onLeaderboardButtons(interaction);
    }

    // Daily spin buttons
    else if (interaction.isButton() && interaction.customId.startsWith('dailyspin|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onDailySpinButtons(interaction, ctx);
    }

    // Roulette select menus
    else if (interaction.isStringSelectMenu() && interaction.customId === 'rou|type') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRouletteTypeSelect(interaction, ctx);
    }
    else if (interaction.isStringSelectMenu() && interaction.customId === 'cartel|shares|posts|select') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelShareOrderSelect(interaction, ctx);
    }
    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cartel|shares|market|buy|select|')) {
      const page = Number(interaction.customId.split('|').pop());
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketSelect(interaction, ctx, 'buy', page);
    }
    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cartel|shares|market|sell|select|')) {
      const page = Number(interaction.customId.split('|').pop());
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketSelect(interaction, ctx, 'sell', page);
    }
    else if (interaction.isStringSelectMenu() && interaction.customId === 'cartel|dealers|manage|select') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerManageSelect(interaction, ctx);
    }

    // Help select menu
    else if (interaction.isStringSelectMenu() && interaction.customId === 'help|section') {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHelpSelect(interaction, ctx);
    }
    else if (interaction.isButton() && interaction.customId.startsWith('help|page|')) {
      if (interaction.customId === 'help|page|noop') return interaction.deferUpdate().catch(() => {});
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHelpPageButtons(interaction, ctx);
    }

    // Request reject modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|warehouse|burn|modal|')) {
      const messageId = interaction.customId.substring('cartel|warehouse|burn|modal|'.length) || '0';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelWarehouseBurnModal(interaction, ctx, messageId);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|warehouse|export|modal|')) {
      const messageId = interaction.customId.substring('cartel|warehouse|export|modal|'.length) || '0';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelWarehouseExportModal(interaction, ctx, messageId);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|dealers|upkeep_modal|')) {
      const dealerId = interaction.customId.substring('cartel|dealers|upkeep_modal|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelDealerUpkeepModal(interaction, ctx, dealerId);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|collect|modal|')) {
      const messageId = interaction.customId.substring('cartel|collect|modal|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelCollectModal(interaction, ctx, messageId);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|sell|modal|')) {
      const messageId = interaction.customId.substring('cartel|sell|modal|'.length);
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelSellModal(interaction, ctx, messageId);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|shares|order|modal|')) {
      const parts = interaction.customId.split('|');
      const side = parts.length > 4 ? parts[4] : 'SELL';
      const messageId = parts.length > 5 ? parts[5] : '0';
      const viewToken = parts.length > 6 ? parts[6] : 'shares';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelShareOrderModal(interaction, ctx, side, messageId, viewToken);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|shares|market|buy|modal|')) {
      const parts = interaction.customId.split('|');
      const orderId = parts.length > 5 ? parts[5] : '0';
      const page = parts.length > 6 ? parts[6] : '1';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketModal(interaction, ctx, 'buy', orderId, page);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('cartel|shares|market|sell|modal|')) {
      const parts = interaction.customId.split('|');
      const orderId = parts.length > 5 ? parts[5] : '0';
      const page = parts.length > 6 ? parts[6] : '1';
      const ctx = buildCommandContext(interaction, ctxExtras);
      return handleCartelMarketModal(interaction, ctx, 'sell', orderId, page);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('req|rejmodal|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRequestRejectModal(interaction, ctx);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('bj|betmodal|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onBlackjackBetModal(interaction, ctx);
    }

    // Roulette modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('rou|modal|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onRouletteModal(interaction, ctx);
    }

    // Hold'em bet modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|bet|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHoldemBetModal(interaction, ctx);
    }
    // Hold'em join modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|join|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHoldemJoinModal(interaction, ctx);
    }
    // Hold'em custom table modal submits
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('hold|custom|')) {
      const ctx = buildCommandContext(interaction, ctxExtras);
      return onHoldemCustomModal(interaction, ctx);
    }

    else if (interaction.isModalSubmit() && interaction.customId.startsWith('horse|betmodal|')) {
      return onHorseRaceBetModal(interaction);
    }
  }
  return routeComponent;
}
