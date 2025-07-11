const units = {};

// Load all lessons from a single JSON file in the "lessons" folder
fetch("lessons/lessons.json")
  .then(res => res.json())
  .then(allLessons => {
    for (const id in allLessons) {
      const data = allLessons[id];
      const { unit_id, topic_id } = data;

      if (!units[unit_id]) units[unit_id] = { unit_question: data.unit_question, topics: {} };
      if (!units[unit_id].topics[topic_id]) {
        units[unit_id].topics[topic_id] = {
          topic_title: data.topic_title,
          lessons: {}
        };
      }

      units[unit_id].topics[topic_id].lessons[data.lesson_day] = data;
    }

    drawUnitButtons();
  });

// Step 1: Show unit buttons
function drawUnitButtons() {
  const unitDiv = document.getElementById("unitButtons");
  unitDiv.innerHTML = "<h2>Select a Unit</h2>";

  for (const unit_id in units) {
    const btn = document.createElement("button");
    btn.textContent = `${unit_id}: ${units[unit_id].unit_question}`;
    btn.onclick = () => drawTopicButtons(unit_id);
    unitDiv.appendChild(btn);
  }
}

// Step 2: Show topic buttons for selected unit
function drawTopicButtons(unit_id) {
  const topicDiv = document.getElementById("topicButtons");
  topicDiv.innerHTML = "<h2>Select a Topic</h2>";

  const unit = units[unit_id];
  for (const topic_id in unit.topics) {
    const btn = document.createElement("button");
    btn.textContent = unit.topics[topic_id].topic_title;
    btn.onclick = () => drawLessonButtons(unit_id, topic_id);
    topicDiv.appendChild(btn);
  }

  document.getElementById("lessonButtons").innerHTML = "";
  document.getElementById("lessonView").innerHTML = "";
}

// Step 3: Show lesson A/B buttons
function drawLessonButtons(unit_id, topic_id) {
  const lessonDiv = document.getElementById("lessonButtons");
  lessonDiv.innerHTML = "<h2>Select a Lesson</h2>";

  const { lessons } = units[unit_id].topics[topic_id];

  ["Day One", "Day Two"].forEach(day => {
    if (lessons[day]) {
      const btn = document.createElement("button");
      btn.textContent = `${day} Day: ${lessons[day].hook_question}`;
      btn.onclick = () => renderLesson(lessons[day]);
      lessonDiv.appendChild(btn);
    }
  });

  document.getElementById("lessonView").innerHTML = "";
}

// Step 4: Render the full lesson view
function renderLesson(data) {
  const out = document.getElementById("lessonView");
  out.innerHTML = `
    <h2>${data.topic_title} (${data.lesson_id})</h2>
    <h3>Learning Objective</h3>
    <p>${data.learning_objective}</p>
    <ul>${data.success_criteria.map(x => `<li>${x}</li>`).join("")}</ul>
    
    <h3>Intro Image</h3>
    <img src="${data.image_url.replace('img:', 'images/')}" style="max-width:100%;" />
    <p><em>${data.image_description}</em></p>
    
    <h3>Hook Question</h3>
    <blockquote>${data.hook_question}</blockquote>
    
    <h3>Vocabulary</h3>
    <ul>
      ${data.vocab_list.map(v => `<li><a href="${v.link.replace('link:', '#')}" target="_blank">${v.term}</a></li>`).join("")}
    </ul>

    <h3>Readings</h3>
    ${["reading_1", "reading_2"].map(key => {
      const r = data[key];
      return `<div><h4>${r.title}</h4><p><em>${r.summary}</em></p></div>`;
    }).join("")}

    <h3>Discussion Questions</h3>
    <ul>${data.discussion_questions.map(q => `<li>${q}</li>`).join("")}</ul>

    <h3>Demonstration of Learning</h3>
    <p>${data.DOL_prompt}</p>
  `;
}
