// Google Apps Script API Endpoint
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzth-z3eP-UaXf3NwKj9x2a-k7eGcopkf81wXIVCkiYiKQZmAwsUJ5wZUqkpPE2MuuiWw/exec";

// In-Memory App State (Zero LocalStorage)
let subjects = [];
let tasks = [];
let currentSubjectId = null;
let pomodoroSeconds = 25 * 60;
let pomodoroInterval = null;

// --- GOOGLE SHEETS API SYNC HELPERS ---

async function loadDataFromSheet() {
    if (!APPS_SCRIPT_URL) return;

    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        if (!response.ok) throw new Error("Failed to load data from Google Sheets.");
        
        const data = await response.json();
        tasks = data.tasks || [];
        subjects = data.subjects || [];
    } catch (err) {
        console.error("Error fetching data from backend:", err);
    }
}

async function syncTaskToSheet(task) {
    if (!APPS_SCRIPT_URL) return;

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "saveTask", ...task })
        });
    } catch (err) {
        console.error("Error saving task to Google Sheets:", err);
    }
}

async function syncSubjectToSheet(subject) {
    if (!APPS_SCRIPT_URL) return;

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "saveSubject", ...subject })
        });
    } catch (err) {
        console.error("Error saving subject to Google Sheets:", err);
    }
}

// --- ACTIVE VIEW ROUTER ---

async function navigateTo(pageName) {
    const container = document.getElementById("app-container");

    try {
        const response = await fetch(`views/${pageName}.html`);
        if (!response.ok) throw new Error("Page not found");
        const html = await response.text();
        container.innerHTML = html;

        document.querySelectorAll(".nav-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.page === pageName);
        });

        if (pomodoroInterval) {
            clearInterval(pomodoroInterval);
            pomodoroInterval = null;
        }
        if (pageName === "dashboard") renderTasks();
        if (pageName === "subjects") {
            currentSubjectId = null;
            renderSubjects();
        }
        if (pageName === "calendar") renderCalendar();
        if (pageName === "progress") renderProgress();
        if (pageName === "pomodoro") renderPomodoro();

        document.getElementById("appLayout").classList.remove("sidebar-open");
        updateSidebarAccessibility();
        document.getElementById("searchResults").classList.add("hidden");
        document.getElementById("notificationPanel").classList.add("hidden");
        document.getElementById("notificationButton").setAttribute("aria-expanded", "false");
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
        console.error(`Error loading ${pageName} page:`, err);
        container.innerHTML = `<div class="card"><p>Error loading page view.</p></div>`;
    }
}

function toggleSidebar(forceClose = false) {
    const layout = document.getElementById("appLayout");
    if (forceClose) {
        layout.classList.remove("sidebar-open");
        updateSidebarAccessibility();
        return;
    }

    if (window.matchMedia("(max-width: 760px)").matches) {
        layout.classList.toggle("sidebar-open");
    } else {
        layout.classList.toggle("sidebar-collapsed");
    }
    updateSidebarAccessibility();
}

function updateSidebarAccessibility() {
    const layout = document.getElementById("appLayout");
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const expanded = mobile
        ? layout.classList.contains("sidebar-open")
        : !layout.classList.contains("sidebar-collapsed");
    const desktopToggle = document.querySelector(".sidebar-toggle");
    const mobileToggle = document.querySelector(".mobile-menu-button");

    desktopToggle.setAttribute("aria-expanded", String(expanded));
    desktopToggle.setAttribute("aria-label", expanded ? "Collapse navigation" : "Expand navigation");
    desktopToggle.title = expanded ? "Collapse navigation" : "Expand navigation";
    mobileToggle.setAttribute("aria-expanded", String(expanded));
    mobileToggle.setAttribute("aria-label", expanded ? "Close navigation" : "Open navigation");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function parseDeadline(deadline) {
    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
    const [year, month, day] = deadline.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

function formatDeadline(deadline, options = { month: "short", day: "numeric" }) {
    const date = parseDeadline(deadline);
    return date ? date.toLocaleDateString(undefined, options) : "";
}

function getUpcomingTasks() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);

    return tasks
        .filter(task => !task.completed && parseDeadline(task.deadline))
        .map(task => ({ task, date: parseDeadline(task.deadline) }))
        .filter(item => item.date <= end)
        .sort((a, b) => a.date - b.date);
}

function updateNotifications() {
    const badge = document.getElementById("notifBadge");
    if (!badge) return;

    const upcoming = getUpcomingTasks();
    badge.textContent = upcoming.length > 9 ? "9+" : String(upcoming.length);
    badge.classList.toggle("hidden", upcoming.length === 0);
}

function toggleNotifications() {
    const panel = document.getElementById("notificationPanel");
    const button = document.getElementById("notificationButton");
    const isOpening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isOpening);
    button.setAttribute("aria-expanded", String(isOpening));

    if (!isOpening) return;
    const upcoming = getUpcomingTasks();
    panel.innerHTML = `
        <div class="notification-panel-heading">
            <div><strong>Deadline reminders</strong><span>${upcoming.length} upcoming</span></div>
            <button class="panel-close-button" onclick="toggleNotifications()" aria-label="Close reminders"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${upcoming.length
            ? `<div class="notification-list">${upcoming.map(({ task, date }) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const daysLeft = Math.round((date - today) / 86400000);
                const label = daysLeft < 0 ? "Overdue" : daysLeft === 0 ? "Due today" : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
                return `<button class="notification-item" onclick="openDeadline('${task.deadline}')">
                    <span class="notification-dot"></span>
                    <span><strong>${escapeHtml(task.name)}</strong><small>${label} · ${formatDeadline(task.deadline)}</small></span>
                </button>`;
            }).join("")}</div>`
            : `<p class="notification-empty"><i class="fa-regular fa-circle-check"></i> You're all clear. No upcoming deadlines.</p>`}
        <button class="notification-footer" onclick="navigateTo('calendar')">View calendar <i class="fa-solid fa-arrow-right"></i></button>
    `;
}

function handleGlobalSearch(event) {
    const query = event.target.value.trim();
    const results = document.getElementById("searchResults");
    if (!query) {
        results.classList.add("hidden");
        results.innerHTML = "";
        return;
    }

    const matches = findSearchMatches(query).slice(0, 6);
    results.innerHTML = matches.length
        ? matches.map((match, index) => `<button class="search-result-item" role="option" data-result-index="${index}"
            onclick="openSearchResult(${JSON.stringify(match.type)}, ${match.id}, ${match.parentId ?? "null"}, ${match.topicId ?? "null"})">
            <span class="search-result-icon"><i class="fa-solid ${match.icon}"></i></span>
            <span class="search-result-copy"><strong>${escapeHtml(match.title)}</strong><small>${escapeHtml(match.subtitle)}</small></span>
            <i class="fa-solid fa-arrow-up-right-from-square search-result-arrow"></i>
        </button>`).join("")
        : `<p class="search-no-results">No matches yet. Try a subject, topic, or task name.</p>`;
    results.classList.remove("hidden");
}

function handleSearchKeydown(event) {
    if (event.key === "Escape") {
        document.getElementById("searchResults").classList.add("hidden");
        event.target.blur();
    } else if (event.key === "Enter") {
        event.preventDefault();
        const query = event.target.value.trim();
        if (query) showSearchResults(query);
    }
}

function findSearchMatches(query) {
    const normalizedQuery = query.toLocaleLowerCase();
    const matches = [];

    subjects.forEach(subject => {
        if (String(subject.name || "").toLocaleLowerCase().includes(normalizedQuery)) {
            matches.push({ type: "subject", id: subject.id, title: subject.name, subtitle: `${subject.difficulty || "Subject"} · Course`, icon: "fa-book-open" });
        }
        (subject.topics || []).forEach(topic => {
            if (String(topic.name || "").toLocaleLowerCase().includes(normalizedQuery)) {
                matches.push({ type: "topic", id: topic.id, parentId: subject.id, title: topic.name, subtitle: `Topic in ${subject.name}`, icon: "fa-folder" });
            }
            (topic.files || []).forEach(file => {
                if (String(file.fileName || "").toLocaleLowerCase().includes(normalizedQuery)) {
                    matches.push({ type: "file", id: file.id, parentId: subject.id, topicId: topic.id, title: file.fileName, subtitle: `Material in ${subject.name} · ${topic.name}`, icon: "fa-file-lines" });
                }
            });
        });
    });
    tasks.forEach(task => {
        if (String(task.name || "").toLocaleLowerCase().includes(normalizedQuery)) {
            matches.push({ type: "task", id: task.id, title: task.name, subtitle: task.deadline ? `Task · Due ${formatDeadline(task.deadline)}` : "Study task", icon: "fa-list-check" });
        }
    });
    return matches;
}

async function openSearchResult(type, id, parentId = null, topicId = null) {
    if (type === "task") {
        await navigateTo("dashboard");
        const task = document.getElementById(`task-${id}`);
        if (task) task.closest(".task-item").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
    }

    await navigateTo("subjects");
    if (type === "file") {
        openSubjectDetail(parentId);
        const fileRow = document.getElementById(`file-${parentId}-${topicId}-${id}`);
        if (fileRow) {
            fileRow.classList.add("search-match-highlight");
            fileRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    } else {
        openSubjectDetail(type === "topic" ? parentId : id);
    }
}

function showSearchResults(query) {
    const matches = findSearchMatches(query);
    document.getElementById("searchResults").classList.add("hidden");
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById("app-container").innerHTML = `
        <section class="page-container">
            <div class="welcome-header">
                <p class="small-tag"><i class="fa-solid fa-magnifying-glass"></i> Search</p>
                <h1>Results for “${escapeHtml(query)}”</h1>
                <p>${matches.length} matching ${matches.length === 1 ? "result" : "results"} across your study space.</p>
            </div>
            <div class="search-page-results">
                ${matches.length ? matches.map(match => `<button class="search-page-result" onclick="openSearchResult(${JSON.stringify(match.type)}, ${match.id}, ${match.parentId ?? "null"}, ${match.topicId ?? "null"})">
                    <span class="search-result-icon"><i class="fa-solid ${match.icon}"></i></span>
                    <span class="search-result-copy"><strong>${escapeHtml(match.title)}</strong><small>${escapeHtml(match.subtitle)}</small></span>
                    <i class="fa-solid fa-arrow-right"></i>
                </button>`).join("") : `<div class="card search-empty-state"><i class="fa-regular fa-face-meh"></i><h2>No results found</h2><p>Try another keyword, or create a new subject or study task.</p></div>`}
            </div>
        </section>`;
}

// --- SUBJECT MANAGEMENT ---

async function addSubject() {
    const nameInput = document.getElementById("subjectName");
    const diffInput = document.getElementById("subjectDifficulty");
    const name = nameInput ? nameInput.value.trim() : "";

    if (!name) return alert("Please enter a subject name.");

    const newSubject = { 
        id: Date.now(), 
        name, 
        difficulty: diffInput ? diffInput.value : "Medium",
        topics: [] 
    };

    subjects.push(newSubject);
    await syncSubjectToSheet(newSubject);

    if (nameInput) nameInput.value = "";
    renderSubjects();
}

function renderSubjects() {
    const container = document.getElementById("subjectWidgetGrid");
    if (!container) return;

    if (subjects.length === 0) {
        container.innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No subjects added yet.</p>`;
        return;
    }

    container.innerHTML = subjects.map(sub => `
        <div class="subject-item" onclick="openSubjectDetail(${sub.id})" style="cursor: pointer;">
            <div>
                <strong>${sub.name}</strong>
                <span class="sub-badge">${sub.difficulty}</span>
            </div>
            <button class="delete-btn" onclick="deleteSubject(${sub.id}, event)">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");
}

async function deleteSubject(id, event) {
    if (event) event.stopPropagation();
    subjects = subjects.filter(s => s.id !== id);
    
    // Deletion sync request
    if (APPS_SCRIPT_URL) {
        try {
            await fetch(APPS_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "deleteSubject", id })
            });
        } catch(e) {}
    }
    
    if (currentSubjectId === id) {
        closeSubjectDetail();
    } else {
        renderSubjects();
    }
}

// --- SUBJECT DETAILS & TOPICS ---

function openSubjectDetail(subjectId) {
    currentSubjectId = subjectId;
    const overviewSec = document.getElementById("subjectOverviewSection");
    const detailSec = document.getElementById("subjectDetailSection");

    if (overviewSec && detailSec) {
        overviewSec.classList.add("hidden");
        detailSec.classList.remove("hidden");
        renderSubjectDetail();
    }
}

function closeSubjectDetail() {
    currentSubjectId = null;
    const overviewSec = document.getElementById("subjectOverviewSection");
    const detailSec = document.getElementById("subjectDetailSection");

    if (overviewSec && detailSec) {
        detailSec.classList.add("hidden");
        overviewSec.classList.remove("hidden");
        renderSubjects();
    }
}

function renderSubjectDetail() {
    const container = document.getElementById("subjectDetailContent");
    if (!container || !currentSubjectId) return;

    const sub = subjects.find(s => s.id === currentSubjectId);
    if (!sub) return closeSubjectDetail();

    container.innerHTML = `
        <div class="card subject-folder-card">
            <div class="subject-header" style="margin-bottom: 20px;">
                <h2><i class="fa-solid fa-folder-open"></i> ${sub.name}</h2>
                <span class="sub-badge">${sub.difficulty || 'Medium'}</span>
            </div>

            <!-- Add Topic Form -->
            <div class="add-topic-box" style="display: flex; gap: 10px; margin-bottom: 20px;">
                <input type="text" id="topic-input-${sub.id}" placeholder="Add topic folder (e.g. Chapter 1)..." style="flex: 1;">
                <button class="secondary-button" onclick="addTopic(${sub.id})">+ Add Topic</button>
            </div>

            <!-- List Topic Folders & Uploaded Files -->
            <div class="topics-container">
                ${(sub.topics || []).length === 0 
                    ? `<p class="empty-text"><i class="fa-solid fa-folder-plus"></i> No topic folders yet. Create one above!</p>`
                    : (sub.topics || []).map(topic => `
                        <div class="topic-folder" style="margin-bottom: 20px; padding: 16px; border-radius: 8px; background: var(--bg-subcard);">
                            <h4><i class="fa-solid fa-folder"></i> ${topic.name}</h4>
                            
                            <div class="upload-btn-wrapper" style="margin: 12px 0;">
                                <label class="file-upload-label" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-file-arrow-up"></i> Upload PDF / Note
                                    <input type="file" accept=".pdf,image/*" onchange="uploadFile(${sub.id},${topic.id}, event)" style="display: none;">
                                </label>
                            </div>

                            <ul class="file-list" style="list-style: none; padding: 0;">
                                ${(topic.files || []).map(file => `
                                    <li id="file-${sub.id}-${topic.id}-${file.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                                        <a href="javascript:void(0)" onclick="viewFile(${sub.id}, ${topic.id}, ${file.id})" style="text-decoration: none; color: inherit;">
                                            <i class="fa-solid fa-file-pdf"></i> ${file.fileName}
                                        </a>
                                        <i class="fa-solid fa-xmark remove-file-icon" onclick="deleteFile(${sub.id}, ${topic.id}, ${file.id})" title="Delete File" style="cursor: pointer; color: #d9534f;"></i>
                                    </li>
                                `).join("")}
                            </ul>
                        </div>
                    `).join("")
                }
            </div>
        </div>
    `;
}

function viewFile(subjectId, topicId, fileId) {
    const sub = subjects.find(s => s.id === subjectId);
    if (!sub) return;
    const topic = (sub.topics || []).find(t => t.id === topicId);
    if (!topic) return;
    const file = (topic.files || []).find(f => f.id === fileId);
    if (!file || !file.fileData) return;

    try {
        const base64Parts = file.fileData.split(',');
        const mimeMatch = base64Parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';

        const byteCharacters = atob(base64Parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        const blob = new Blob([byteArray], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        
        window.open(blobUrl, '_blank');
    } catch (err) {
        console.error("Error displaying file:", err);
        alert("Failed to view file preview.");
    }
}

async function addTopic(subjectId) {
    const topicInput = document.getElementById(`topic-input-${subjectId}`);
    const topicName = topicInput ? topicInput.value.trim() : "";
    if (!topicName) return alert("Please enter a topic name.");

    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
        if (!subject.topics) subject.topics = [];
        subject.topics.push({
            id: Date.now(),
            name: topicName,
            files: []
        });
        await syncSubjectToSheet(subject);
        renderSubjectDetail();
    }
}

async function uploadFile(subjectId, topicId, event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        let resultData = e.target.result;

        const subject = subjects.find(s => s.id === subjectId);
        if (subject) {
            const topic = (subject.topics || []).find(t => t.id === topicId);
            if (topic) {
                if (!topic.files) topic.files = [];
                topic.files.push({
                    id: Date.now(),
                    fileName: file.name,
                    fileData: resultData
                });
                await syncSubjectToSheet(subject);
                renderSubjectDetail();
            }
        }
    };
    reader.readAsDataURL(file);
}

async function deleteFile(subjectId, topicId, fileId) {
    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
        const topic = (subject.topics || []).find(t => t.id === topicId);
        if (topic) {
            topic.files = topic.files.filter(f => f.id !== fileId);
            await syncSubjectToSheet(subject);
            renderSubjectDetail();
        }
    }
}

// --- TASK MANAGEMENT ---

async function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        await syncTaskToSheet(task);
        renderTasks();
        updateNotifications();
    }
}

function renderTasks() {
    const container = document.getElementById("taskList");
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `<p class="empty-text"><i class="fa-solid fa-inbox"></i> No tasks found. Create one with AI Planner!</p>`;
        updateStats();
        return;
    }

    container.innerHTML = tasks.map(task => `
        <div class="task-item ${task.completed ? 'completed' : ''}">
            <input type="checkbox" id="task-${task.id}" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
            <label for="task-${task.id}" class="task-details">
                <span class="task-title">${escapeHtml(task.name)}</span>
                <span class="task-meta"><i class="fa-regular fa-clock"></i> ${Number(task.duration) || 0} mins${task.deadline ? ` <span class="task-deadline"><i class="fa-regular fa-calendar"></i> Due ${formatDeadline(task.deadline)}</span>` : ""}</span>
            </label>
        </div>
    `).join("");

    updateStats();
}

function updateStats() {
    const remaining = tasks.filter(t => !t.completed);
    const completedCount = tasks.length - remaining.length;
    
    const studyTimeElem = document.getElementById("studyTime");
    const completedStatElem = document.getElementById("completedStat");
    const completionRateElem = document.getElementById("completionRate");
    const subjectCountElem = document.getElementById("subjectCount");

    if (completedStatElem) completedStatElem.textContent = `${completedCount} / ${tasks.length}`;
    if (subjectCountElem) subjectCountElem.textContent = subjects.length;

    const totalMinutes = remaining.reduce((acc, t) => acc + (Number(t.duration) || 0), 0);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    
    if (studyTimeElem) studyTimeElem.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;

    const rate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
    if (completionRateElem) completionRateElem.textContent = `${rate}%`;

    const alertBanner = document.getElementById("deadlineAlert");
    const closeDeadlines = getUpcomingTasks().filter(({ date }) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.round((date - today) / 86400000) <= 3;
    });
    if (alertBanner) {
        alertBanner.classList.toggle("hidden", closeDeadlines.length === 0);
        if (closeDeadlines.length) {
            const alertText = document.getElementById("deadlineAlertText");
            if (alertText) {
                alertText.textContent = closeDeadlines.some(({ date }) => date < new Date().setHours(0, 0, 0, 0))
                    ? `You have ${closeDeadlines.length} overdue or soon-due task${closeDeadlines.length === 1 ? "" : "s"}. Check your calendar to plan your next step.`
                    : `You have ${closeDeadlines.length} deadline${closeDeadlines.length === 1 ? "" : "s"} coming up within 3 days. Check your calendar to stay on track.`;
            }
        }
    }
    updateNotifications();
}

let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function changeCalendarMonth(offset) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
    renderCalendar();
}

function goToCurrentMonth() {
    calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderCalendar();
}

async function openDeadline(deadline) {
    await navigateTo("calendar");
    const date = parseDeadline(deadline);
    if (date) {
        calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        renderCalendar();
    }
}

function renderCalendar() {
    const heading = document.getElementById("calendarMonthLabel");
    const grid = document.getElementById("calendarGrid");
    const list = document.getElementById("calendarDeadlineList");
    if (!heading || !grid || !list) return;

    heading.textContent = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const tasksByDate = new Map();
    tasks.filter(task => !task.completed && parseDeadline(task.deadline)).forEach(task => {
        if (!tasksByDate.has(task.deadline)) tasksByDate.set(task.deadline, []);
        tasksByDate.get(task.deadline).push(task);
    });

    const cells = [];
    for (let i = 0; i < firstDayOffset; i++) cells.push(`<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>`);
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayTasks = tasksByDate.get(dateKey) || [];
        const dayClasses = ["calendar-day"];
        if (dateKey === todayKey) dayClasses.push("is-today");
        if (dayTasks.length) dayClasses.push("has-deadline");
        cells.push(`<div class="${dayClasses.join(" ")}" ${dayTasks.length ? `title="${dayTasks.length} deadline${dayTasks.length === 1 ? "" : "s"}"` : ""}>
            <span>${day}</span>${dayTasks.length ? `<span class="calendar-day-count">${dayTasks.length}</span>` : ""}
        </div>`);
    }
    grid.innerHTML = cells.join("");

    const monthTasks = tasks
        .filter(task => !task.completed && parseDeadline(task.deadline))
        .filter(task => {
            const date = parseDeadline(task.deadline);
            return date.getFullYear() === year && date.getMonth() === month;
        })
        .sort((a, b) => a.deadline.localeCompare(b.deadline));
    list.innerHTML = monthTasks.length
        ? monthTasks.map(task => `<div class="calendar-task-item">
            <span class="calendar-task-date">${formatDeadline(task.deadline, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span class="calendar-task-name">${escapeHtml(task.name)}</span>
            <span class="calendar-task-time">${Number(task.duration) || 0} min</span>
        </div>`).join("")
        : `<p class="empty-text"><i class="fa-regular fa-calendar"></i> No upcoming deadlines this month. Generate a plan to add a deadline.</p>`;
}

function renderProgress() {
    const container = document.getElementById("progressSummary");
    if (!container) return;

    const completedCount = tasks.filter(task => task.completed).length;
    const remainingCount = tasks.length - completedCount;
    const rate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
    const totalMinutes = tasks.filter(task => task.completed).reduce((total, task) => total + (Number(task.duration) || 0), 0);
    const completedHours = Math.floor(totalMinutes / 60);
    const completedMinutes = totalMinutes % 60;

    container.innerHTML = `
        <div class="progress-stats-grid">
            <article class="progress-stat-card"><span class="stat-icon-wrapper"><i class="fa-solid fa-list-check"></i></span><strong>${tasks.length}</strong><span>Planned tasks</span></article>
            <article class="progress-stat-card"><span class="stat-icon-wrapper"><i class="fa-solid fa-circle-check"></i></span><strong>${completedCount}</strong><span>Tasks completed</span></article>
            <article class="progress-stat-card"><span class="stat-icon-wrapper"><i class="fa-solid fa-hourglass-half"></i></span><strong>${completedHours}h ${completedMinutes}m</strong><span>Focused time completed</span></article>
            <article class="progress-stat-card"><span class="stat-icon-wrapper"><i class="fa-solid fa-book-open"></i></span><strong>${subjects.length}</strong><span>Active subjects</span></article>
        </div>
        <section class="card progress-overview">
            <div class="section-title"><div><p class="small-tag">YOUR MOMENTUM</p><h2>Task completion</h2></div><strong class="progress-rate">${rate}%</strong></div>
            <div class="progress-track" role="progressbar" aria-label="Task completion" aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100"><span style="width: ${rate}%"></span></div>
            <p class="muted-text">${completedCount} completed · ${remainingCount} still to go. Every focused session counts.</p>
        </section>`;
}

function renderPomodoro() {
    updatePomodoroDisplay();
    const startButton = document.getElementById("pomodoroStartButton");
    if (startButton) startButton.innerHTML = `<i class="fa-solid fa-play"></i> Start focus`;
}

function updatePomodoroDisplay() {
    const clock = document.getElementById("timerClock");
    if (clock) {
        const minutes = Math.floor(pomodoroSeconds / 60);
        const seconds = pomodoroSeconds % 60;
        clock.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
}

function togglePomodoro() {
    const startButton = document.getElementById("pomodoroStartButton");
    if (pomodoroInterval) {
        clearInterval(pomodoroInterval);
        pomodoroInterval = null;
        if (startButton) startButton.innerHTML = `<i class="fa-solid fa-play"></i> Resume focus`;
        return;
    }

    if (pomodoroSeconds <= 0) {
        pomodoroSeconds = 25 * 60;
        const status = document.getElementById("pomodoroStatus");
        if (status) status.textContent = "One small focus sprint at a time.";
    }
    if (startButton) startButton.innerHTML = `<i class="fa-solid fa-pause"></i> Pause`;
    pomodoroInterval = setInterval(() => {
        pomodoroSeconds -= 1;
        updatePomodoroDisplay();
        if (pomodoroSeconds <= 0) {
            clearInterval(pomodoroInterval);
            pomodoroInterval = null;
            const status = document.getElementById("pomodoroStatus");
            if (status) status.textContent = "Focus session complete. Take a short break!";
            if (startButton) startButton.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Start another`;
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("StudyNest focus session complete", { body: "Great work! Take a short break before your next session." });
            }
        }
    }, 1000);
}

function resetPomodoro() {
    if (pomodoroInterval) clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroSeconds = 25 * 60;
    const status = document.getElementById("pomodoroStatus");
    if (status) status.textContent = "One small focus sprint at a time.";
    const startButton = document.getElementById("pomodoroStartButton");
    if (startButton) startButton.innerHTML = `<i class="fa-solid fa-play"></i> Start focus`;
    updatePomodoroDisplay();
}

// --- AI PLANNER LOGIC ---

async function generatePlan() {
    const topic = document.getElementById("studyTopic").value.trim();
    const deadline = document.getElementById("deadline").value;
    const hours = Number(document.getElementById("dailyHours").value);
    const difficulty = document.getElementById("difficulty").value;

    if (!topic || !deadline) return alert("Please fill in both topic and target deadline.");

    const deadlineDate = parseDeadline(deadline);
    if (!deadlineDate) return alert("Please choose a valid target deadline.");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.max(1, Math.ceil((deadlineDate - today) / 86400000));
    const studyDays = Math.min(days, 7);

    const resultDiv = document.getElementById("generatedPlan");
    resultDiv.innerHTML = "";

    for (let i = 1; i <= studyDays; i++) {
        const dayCard = document.createElement("div");
        dayCard.className = "plan-day-card";
        
        let note = i === studyDays 
            ? `Final review & mock questions for ${escapeHtml(topic)}.`
            : `Focus study on ${escapeHtml(topic)} core concepts (Difficulty: ${escapeHtml(difficulty)}).`;

        dayCard.innerHTML = `
            <h4>Day ${i}</h4>
            <p><i class="fa-regular fa-clock"></i> ${hours} hour(s)/day</p>
            <p>${note}</p>
        `;
        resultDiv.appendChild(dayCard);
    }

    document.getElementById("planResult").classList.remove("hidden");

    const newTask = {
        id: Date.now(),
        name: `Study Focus: ${topic}`,
        duration: hours * 60,
        completed: false,
        deadline
    };

    tasks.push(newTask);
    await syncTaskToSheet(newTask);
    updateNotifications();
}

// --- THEME TOGGLE ---

function toggleTheme() {
    const body = document.body;
    const isLight = body.classList.toggle('light-mode');
    document.querySelectorAll(".theme-switch input").forEach(checkbox => {
        checkbox.checked = isLight;
    });
}

// --- INITIAL BOOT ---

document.addEventListener('DOMContentLoaded', async () => {
    updateSidebarAccessibility();
    window.addEventListener("resize", updateSidebarAccessibility);

    // Purge browser local storage
    try { localStorage.clear(); } catch(e) {}

    // Fetch live data directly from Google Sheet before rendering
    await loadDataFromSheet();
    updateNotifications();
    document.addEventListener("click", event => {
        if (!event.target.closest(".notification-wrapper")) {
            document.getElementById("notificationPanel").classList.add("hidden");
            document.getElementById("notificationButton").setAttribute("aria-expanded", "false");
        }
        if (!event.target.closest(".search-container")) {
            document.getElementById("searchResults").classList.add("hidden");
        }
    });
    navigateTo('home');
});