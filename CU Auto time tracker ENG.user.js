// ==UserScript==
// @name         ClickUp Time Tracker on Google Meet
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Automatic ClickUp timer start/stop + Intelligent Base Timer
// @author       Bartłomiej Dąbrowski
// @match        https://meet.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.clickup.com
// @updateURL    https://raw.githubusercontent.com/bdabrowski-lang/ClickUp-Time-Tracker-Base/main/clickup-meet-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/bdabrowski-lang/ClickUp-Time-Tracker-Base/main/clickup-meet-tracker.user.js
// ==/UserScript==

(function () {

    'use strict';
    // ==========================================================
    // 1. CONFIGURATION
    // ==========================================================
    const API_KEY = ''; // Private ClickUp API key

    // Base timer options
    const ENABLE_BASE_TIMER = true; // Enable default timer after leaving meeting
    const BASE_TASK_ID = '86c1tk27q'; // ID of default task (timer)
    const BASE_TASK_DESC = 'Own work'; // Description of default timer (info sent to CU and displayed in general tracker)

    // Dictionary of tasks with trackers we use
    // "[meeting name phrase]: "[Task ID in CU]
    const MEETING_DICTIONARY = {
        "daily": "86c1tk27q",
    };

    // ==========================================================
    // SYSTEM VARIABLES
    // ==========================================================
    let currentTeamId = null;
    let isTrackingStarted = false; // Status for active meeting
    let isBaseTimerRunning = false; // Status for base timer
    let lastCheckedTitle = "";

    async function getTeamId() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://api.clickup.com/api/v2/team",
                headers: { "Authorization": API_KEY },
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.teams && data.teams.length > 0) resolve(data.teams[0].id);
                    } catch (e) { console.error("Error fetching Team ID", e); }
                }
            });
        });
    }

    // Start timer (with type flag)
    function startClickUpTimer(teamId, taskId, description, isBase = false) {
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://api.clickup.com/api/v2/team/${teamId}/time_entries/start`,
            headers: {
                "Authorization": API_KEY,
                "Content-Type": "application/json"
            },
            data: JSON.stringify({ "description": description, "tid": taskId }),
            onload: function (response) {
                if (response.status === 200) {
                    console.log(`✅ ClickUp: Start ${isBase ? 'BASE' : 'MEETING'} (${description})`);
                    if (isBase) {
                        isBaseTimerRunning = true;
                        isTrackingStarted = false;
                    } else {
                        isTrackingStarted = true;
                        isBaseTimerRunning = false;
                    }
                }
            }
        });
    }

    // Stop timer
    function stopClickUpTimer(triggerBase = false) {
        GM_xmlhttpRequest({
            method: "POST",
            url: `https://api.clickup.com/api/v2/team/${currentTeamId}/time_entries/stop`,
            headers: { "Authorization": API_KEY },
            onload: function (response) {
                if (response.status === 200) {
                    console.log("⏹️ ClickUp: Tracking stopped.");
                    isTrackingStarted = false;
                    isBaseTimerRunning = false;
                    lastCheckedTitle = "";

                    if (triggerBase && ENABLE_BASE_TIMER) {
                        startClickUpTimer(currentTeamId, BASE_TASK_ID, BASE_TASK_DESC, true);
                    }
                }
            }
        });
    }

    async function checkMeetingStatus() {
        const titleElement = document.querySelector('[data-meeting-title]');
        const titleText = titleElement ? titleElement.getAttribute('data-meeting-title') : "";

        // SCENARIO A: Meeting detected
        if (titleText && titleText !== lastCheckedTitle) {
            const lowerTitle = titleText.toLowerCase();
            let targetTaskId = null;

            for (const [keyword, taskId] of Object.entries(MEETING_DICTIONARY)) {
                if (lowerTitle.includes(keyword.toLowerCase())) {
                    targetTaskId = taskId;
                    break;
                }
            }

            if (targetTaskId && currentTeamId) {
                lastCheckedTitle = titleText;
                // Switch to meeting regardless of whether base is running
                startClickUpTimer(currentTeamId, targetTaskId, titleText, false);
            }
        }

        // SCENARIO B: Exit from meeting (no title, and meeting tracking was active)
        if (!titleText && isTrackingStarted) {
            stopClickUpTimer(true);
        }
    }

    // Tab closure - stop without restarting base
    window.addEventListener('beforeunload', () => {
        if (isTrackingStarted || isBaseTimerRunning) {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://api.clickup.com/api/v2/team/${currentTeamId}/time_entries/stop`,
                headers: { "Authorization": API_KEY }
            });
        }
    });

    async function init() {
        console.log("🚀 ClickUp Meet Tracker v1.5 initialized.");
        currentTeamId = await getTeamId();
        if (currentTeamId) setInterval(checkMeetingStatus, 3000);
    }
    init();
})();