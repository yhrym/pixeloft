// HUDのマークアップ。mountOffice が root に入れる。CSSは office.css
/** t: 文言の翻訳関数(config.t) */
export const hudHtml = t => `<div id="app">
  <div id="ground"></div>
  <canvas id="scene"></canvas>

  <!-- HUD comes first in Tab order: top bar, my card, chat window (log + input), zoom -->
  <header class="hud-top" id="hudTop">
    <div class="brand"><span id="brandName"></span></div>
    <div class="clock" id="clock">--:--</div>
    <div class="weather" id="weatherBox" title="${t('engine.hud.weather')}"><canvas id="wxIcon" class="px" width="11" height="9"></canvas><span id="wxText"></span></div>
    <div class="sp"></div>
    <button class="presence" id="presenceBtn" aria-haspopup="dialog"><span class="faces" id="faces"></span><span id="presenceCount"></span></button>
    <button class="pbtn ghost" id="helpBtn" aria-label="${t('engine.hud.help')}" aria-haspopup="dialog">?</button>
    <button class="pbtn ghost" id="menuBtn" aria-haspopup="dialog" hidden>${t('engine.hud.menu')}</button>
    <button class="pbtn ghost" id="miniBtn">${t('engine.hud.mini')}</button>
    <button class="pbtn ghost" id="fsBtn">${t('engine.hud.fs')}</button>
    <button class="pbtn ghost leave-top" id="leaveBtn" title="${t('engine.hud.leaveTitle')}">${t('engine.hud.leave')}</button>
  </header>
  <div class="hud-bar"></div>
  <div class="hud-bottom" id="hudBottom">
    <section class="hud-me win" id="hudMe" aria-label="${t('engine.you')}">
      <div class="portrait" id="mePortrait" role="button" tabindex="0" aria-label="${t('engine.hud.changeStatus')}"><i class="sq work" id="mePortraitSq"></i></div>
      <div class="me-main">
        <div class="me-line"><span id="meName"></span><small>${t('engine.you')}</small><button class="me-status" id="meStatusBtn" aria-haspopup="dialog"><i class="sq work" id="meStatusSq"></i><span id="meStatusLabel"></span><span aria-hidden="true">▾</span></button></div>
        <button class="call-chip" id="callChip" hidden></button>
        <div class="me-sub"><span class="me-timer" id="meTimer" hidden></span><button class="me-memo" id="meMemo"></button></div>
        <div class="me-acts"><button class="pbtn sm away-btn" id="awayBtn">${t('engine.away.btn')}</button><button class="pbtn sm" id="dressBtn">${t('engine.hud.dress')}</button><button class="pbtn sm" id="decoBtn">${t('engine.hud.deco')}</button><button class="pbtn sm" id="emoteBtn">${t('engine.hud.emote')}</button></div>
        <div class="notify-row" id="notifyRow" hidden><button class="pbtn sm go" id="notifyBtn">${t('engine.hud.notify')}</button><span class="notify-off" id="notifyOff" hidden>${t('engine.hud.notifyBlocked')}</span><button class="pbtn sm ghost" id="notifyLater">${t('engine.hud.later')}</button></div>
      </div>
    </section>
    <button class="pbtn away-sq" id="awaySq" aria-label="${t('engine.away.do')}"><i class="sq work" id="awaySqSq"></i><span id="awaySqLabel">${t('engine.away.btn')}</span></button>
    <div class="hud-enter win" id="enterBox"><button class="pbtn go" id="enterBtn">${t('engine.enter.btn')}</button><span class="t" id="enterNote">${t('engine.enter.note')}</span></div>
    <section class="hud-log" id="hudLog" aria-labelledby="logTitle">
      <div class="log-head" id="logHeadRow">
        <h2 class="log-tab" id="logTitle"></h2>
        <span class="sp"></span>
        <span class="cnt" id="logCount"></span><span class="badge" id="unread" hidden></span><span class="at-badge" id="unreadAt" hidden>${t('engine.atYou')}</span>
        <button class="pbtn sm meetbtn" type="button" id="islandMeet" aria-label="${t('engine.hud.meet')}" hidden>${t('engine.hud.callBtn')}</button>
        <button class="pbtn sm ghost chev" type="button" id="logHead" aria-expanded="false" aria-controls="logList" aria-label="${t('engine.hud.logExpand')}">▲</button>
      </div>
      <ol class="loglist" id="logList"></ol>
      <p class="note lg-note">${t('engine.log.note')}</p>
      <div class="greet" id="greet" hidden><button class="pbtn sm go" type="button" id="greetBtn"></button><button class="pbtn sm ghost" type="button" id="greetX" aria-label="${t('engine.hud.greetX')}">×</button></div>
      <form class="hud-say" id="sayForm" autocomplete="off">
        <div class="atpop win" id="atPop" role="listbox" aria-label="${t('engine.at.label')}" hidden></div>
        <div class="tawrap"><textarea id="sayInput" rows="1" maxlength="200" aria-label="${t('engine.say.aria')}" aria-autocomplete="list" aria-controls="atPop"></textarea><span class="say-cnt" id="sayCnt" aria-live="polite" hidden></span></div>
        <button class="pbtn go" type="submit">${t('engine.say.send')}</button>
      </form>
    </section>
  </div>
  <button class="sheet-btn pbtn" id="sheetBtn" aria-expanded="false" aria-controls="hudSheet" aria-label="${t('engine.hud.menu')}"><span id="sheetIcon">≡</span><span class="badge" id="unread2" hidden></span></button>
  <section class="hud-sheet win" id="hudSheet" aria-label="${t('engine.hud.menu')}">
    <div class="sheet-me"><button class="call-chip" id="callChip2" hidden></button><span>${t('engine.hud.me')}</span><button class="me-status" id="sheetStatusBtn"><i class="sq work" id="sheetStatusSq"></i><span id="sheetStatusLabel"></span> ▾</button><span>/</span><button class="pbtn sm away-btn" id="awayBtn2">${t('engine.away.btn')}</button><button class="pbtn sm" id="dressBtn2">${t('engine.hud.dress')}</button><button class="pbtn sm" id="decoBtn2">${t('engine.hud.deco')}</button><button class="pbtn sm" id="emoteBtn2">${t('engine.hud.emote')}</button></div>
    <div class="notify-row" id="notifyRow2" hidden><button class="pbtn sm go" id="notifyBtn2">${t('engine.hud.notify')}</button><span class="notify-off" id="notifyOff2" hidden>${t('engine.hud.notifyBlocked')}</span><button class="pbtn sm ghost" id="notifyLater2">${t('engine.hud.later')}</button></div>
    <h2 id="logTitle2"></h2>
    <ol class="loglist" id="logList2"></ol>
    <p class="note">${t('engine.log.note')}</p>
    <h2 id="rosterTitle2"></h2>
    <div id="roster2"></div>
    <h2>${t('engine.hud.other')}</h2>
    <div class="acts"><button class="pbtn sm" id="leaveBtn2" title="${t('engine.hud.leaveTitle')}">${t('engine.hud.leave')}</button><button class="pbtn sm" id="helpBtn2">${t('engine.hud.help')}</button><button class="pbtn sm" id="menuBtn2" hidden>${t('engine.hud.menu')}</button><button class="pbtn sm" id="miniBtn2" hidden>${t('engine.hud.mini')}</button><button class="pbtn sm" id="fsBtn2" hidden>${t('engine.hud.fs')}</button></div>
  </section>
  <div class="zoom" id="zoomBox" aria-label="${t('engine.hud.zoom')}">
    <div class="floors" id="floors" role="group" aria-label="${t('engine.hud.floors')}"></div>
    <button class="pbtn" id="zoomIn" aria-label="${t('engine.hud.zoomIn')}">＋</button>
    <div class="lv" id="zoomLv" aria-live="polite">×2</div>
    <button class="pbtn" id="zoomOut" aria-label="${t('engine.hud.zoomOut')}">−</button>
    <button class="pbtn me" id="zoomMe" aria-label="${t('engine.hud.zoomMeAria')}">${t('engine.hud.zoomMe')}</button>
    <button class="pbtn fit" id="zoomFit" aria-label="${t('engine.hud.zoomFitAria')}">${t('engine.hud.zoomFit')}</button>
  </div>
  <div class="pop win" id="pop" hidden></div>
  <div class="toast win" id="toast" hidden></div>
  <div class="toast win call" id="callToast" role="alert" hidden></div>
  <!-- scene overlay (seats, people, plates) after the HUD so Tab reaches the HUD first -->
  <div id="world"><div id="ov"></div><div id="fxov"></div></div>
</div>`;
