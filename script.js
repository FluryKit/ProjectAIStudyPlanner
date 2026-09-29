// ===============================
// DATA
// ===============================

let subjects = JSON.parse(
    localStorage.getItem("subjects")
) || [];

let tasks = JSON.parse(
    localStorage.getItem("tasks")
) || [];


// ===============================
// PAGE NAVIGATION
// ===============================

function showPage(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        page.classList.remove("active-page");
    });

    document.getElementById(pageName).classList.add("active-page");


    const buttons = document.querySelectorAll(".nav-btn");

    buttons.forEach(button => {
        button.classList.remove("active");
    });

    const activeButton = [...buttons].find(
        button => button.textContent
            .toLowerCase()
            .includes(pageName.replace("-", " "))
    );

    if (activeButton) {
        activeButton.classList.add("active");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// ===============================
// SUBJECTS
// ===============================

function addSubject() {

    const nameInput =
        document.getElementById("subjectName");

    const difficultyInput =
        document.getElementById("subjectDifficulty");


    const name = nameInput.value.trim();

    const difficulty =
        difficultyInput.value;


    if (name === "") {
        alert("Please enter a subject name.");
        return;
    }


    const subject = {
        id: Date.now(),

        name: name,

        difficulty: difficulty
    };


    subjects.push(subject);

    saveData();

    nameInput.value = "";

    renderSubjects();
}


function renderSubjects() {

    const container =
        document.getElementById("subjectList");


    if (subjects.length === 0) {

        container.innerHTML =
            '<p class="empty">No subjects yet ♡</p>';

        return;
    }


    container.innerHTML = "";


    subjects.forEach(subject => {

        const div =
            document.createElement("div");

        div.className = "subject";


        div.innerHTML = `
            <div class="subject-info">
                <strong>${subject.name}</strong>
                <p>Difficulty: ${subject.difficulty}</p>
            </div>

            <button
                class="delete-button"
                onclick="deleteSubject(${subject.id})"
            >
                Delete
            </button>
        `;


        container.appendChild(div);

    });
}


function deleteSubject(id) {

    subjects =
        subjects.filter(subject => subject.id !== id);

    saveData();

    renderSubjects();
}


// ===============================
// TASKS
// ===============================

function addTask(name, duration) {

    const task = {

        id: Date.now(),

        name: name,

        duration: duration,

        completed: false
    };


    tasks.push(task);

    saveData();

    renderTasks();
}


function toggleTask(id) {

    const task =
        tasks.find(task => task.id === id);

    if (!task) return;

    task.completed = !task.completed;

    saveData();

    renderTasks();
}


function renderTasks() {

    const container =
        document.getElementById("taskList");


    if (tasks.length === 0) {

        container.innerHTML =
            '<p class="empty">No tasks yet ♡</p>';

        updateStats();

        return;
    }


    container.innerHTML = "";


    tasks.forEach(task => {

        const div =
            document.createElement("div");

        div.className =
            "task" +
            (task.completed ? " completed" : "");


        div.innerHTML = `

            <input
                type="checkbox"
                ${task.completed ? "checked" : ""}
                onchange="toggleTask(${task.id})"
            >

            <span>
                ${task.name}
                ${task.duration ? ` — ${task.duration} min` : ""}
            </span>

        `;


        container.appendChild(div);

    });


    updateStats();
}


// ===============================
// STATISTICS
// ===============================

function updateStats() {

    const remaining =
        tasks.filter(task => !task.completed);


    document.getElementById("taskCount")
        .textContent = remaining.length;


    const totalMinutes =
        remaining.reduce(
            (total, task) =>
                total + (Number(task.duration) || 0),
            0
        );


    const hours =
        Math.floor(totalMinutes / 60);


    const minutes =
        totalMinutes % 60;


    if (hours > 0) {

        document.getElementById("studyTime")
            .textContent =
            `${hours}h ${minutes}m`;

    } else {

        document.getElementById("studyTime")
            .textContent =
            `${minutes}m`;
    }
}


// ===============================
// SIMPLE AI-STYLE PLAN
// ===============================

function generatePlan() {

    const topic =
        document.getElementById("studyTopic")
            .value.trim();


    const deadline =
        document.getElementById("deadline")
            .value;


    const hours =
        Number(
            document.getElementById("dailyHours")
                .value
        );


    const difficulty =
        document.getElementById("difficulty")
            .value;


    if (topic === "") {

        alert("Please tell us what you need to study.");

        return;
    }


    if (deadline === "") {

        alert("Please choose a deadline.");

        return;
    }


    const today =
        new Date();


    const endDate =
        new Date(deadline);


    const difference =
        endDate - today;


    const days =
        Math.max(
            1,
            Math.ceil(
                difference /
                (1000 * 60 * 60 * 24)
            )
        );


    const studyDays =
        Math.min(days, 7);


    const result =
        document.getElementById("generatedPlan");


    result.innerHTML = "";


    for (
        let i = 1;
        i <= studyDays;
        i++
    ) {

        const day =
            document.createElement("div");

        day.className =
            "plan-day";


        let activity;


        if (i === studyDays) {

            activity =
                `Review ${topic} and do a final practice session.`;

        } else if (difficulty === "Hard") {

            activity =
                `Focus on one difficult part of ${topic}, then spend some time reviewing what you learned.`;

        } else if (difficulty === "Medium") {

            activity =
                `Study a section of ${topic} and complete a few practice questions.`;

        } else {

            activity =
                `Review the basics of ${topic} and create short notes.`;
        }


        day.innerHTML = `

            <h3>Day ${i}</h3>

            <p>
                ⏱ ${hours} hour${hours > 1 ? "s" : ""}
            </p>

            <p>
                ${activity}
            </p>

        `;


        result.appendChild(day);
    }


    document
        .getElementById("planResult")
        .classList.remove("hidden");


    /*
        Add the generated plan
        as a task for now.
    */

    addTask(
        `Study: ${topic}`,
        hours * 60
    );
}


// ===============================
// SAVE DATA
// ===============================

function saveData() {

    localStorage.setItem(
        "subjects",
        JSON.stringify(subjects)
    );


    localStorage.setItem(
        "tasks",
        JSON.stringify(tasks)
    );
}


// ===============================
// LOAD DATA
// ===============================

renderSubjects();

renderTasks();