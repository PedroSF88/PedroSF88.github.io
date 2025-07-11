const units = {};

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

function drawUnitButtons() {
  const unitDiv = document.getElementById("unitButtons");
  unitDiv.innerHTML = "<h2>Select a Unit</h2>";

  for (const unit_id in units) {
    const btn = document.createElement("button");
    btn.textContent = `${unit_id}: ${units[unit_id].unit_question}`;
    btn.onclick = () => {
      document.getElementById("sidebar").style.display = "none";
      drawTopicButtons(unit_id);
    };
    unitDiv.appendChild(btn);
  }
}

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

function drawLessonButtons(unit_id, topic_id) {
  const lessonDiv = document.getElementById("lessonButtons");
  lessonDiv.innerHTML = "<h2>Select a Lesson</h2>";

  const { lessons } = units[unit_id].topics[topic_id];

  ["Day One", "Day Two"].forEach(day => {
    if (lessons[day]) {
      const btn = document.createElement("button");
      btn.textContent = `${day}: ${lessons[day].hook_question}`;
      btn.onclick = () => {
        const lessonID = lessons[day].lesson_id;
        window.location.href = `lesson.html?lesson_id=${lessonID}`;
      };
      lessonDiv.appendChild(btn);
    }
  });

  document.getElementById("lessonView").innerHTML = "";
}
