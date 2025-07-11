const params = new URLSearchParams(window.location.search);
const lessonID = params.get("lesson_id");

if (!lessonID) {
  document.getElementById("lessonView").innerHTML = `
    <h2>No lesson selected</h2>
    <p>Please go back and choose a lesson from the homepage.</p>
  `;
} else {
  fetch("lessons/lessons.json")
    .then(res => res.json())
    .then(allLessons => {
      const lesson = Object.values(allLessons).find(item => item.lesson_id === lessonID);

      if (!lesson) {
        document.getElementById("lessonView").innerHTML = `
          <h2>Lesson not found</h2>
          <p>No lesson found with ID: <code>${lessonID}</code></p>
        `;
        return;
      }

      renderLesson(lesson);
    });
}

function renderLesson(data) {
  const out = document.getElementById("lessonView");
  out.innerHTML = `
    <section class="lesson-header">
      <h1>${data.topic_title}</h1>
      <blockquote>${data.hook_question}</blockquote>
    </section>

    <section>
      <h2>Learning Objective</h2>
      <p>${data.learning_objective}</p>

      <h3>Success Criteria</h3>
      <ul>${data.success_criteria.map(x => `<li>${x}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>Image Analysis</h2>
      <img src="${data.image_url.replace('img:', 'images/')}" style="max-width:100%;" />
      <ol>
        <li>What do you notice first?</li>
        <li>Is there a caption/text?</li>
        <li>List and describe the people, objects, and activities you see.</li>
        <li>Try to make sense of it: 2–3 sentence summary about the image.</li>
      </ol>
    </section>

    <section>
      <h2>Vocabulary</h2>
      <div class="vocab-grid">
        ${data.vocab_list.map(v => `
          <div class="vocab-item">
            <a href="${v.link.replace('link:', '#')}" target="_blank" class="vocab-btn">${v.term}</a>
            <textarea placeholder="Your notes..."></textarea>
          </div>
        `).join("")}
      </div>
    </section>

    <section>
      <h2>Readings</h2>
      <details>
        <summary>Reading 1: ${data.reading_1_outline.title}</summary>
        <p>${data.reading_1_outline.summary}</p>
      </details>
      <details>
        <summary>Reading 2: ${data.reading_2_outline.title}</summary>
        <p>${data.reading_2_outline.summary}</p>
      </details>
    </section>

    <section>
      <h2>Class Discussion</h2>
      <ul>${data.discussion_questions.map(q => `<li>${q}</li>`).join("")}</ul>
    </section>

    <section>
      <h2>Exit Ticket</h2>
      <p>${data.DOL_prompt}</p>
    </section>

    ${data.teks ? `
      <section>
        <h2>TEKS</h2>
        <ul>${data.teks.map(t => `<li>${t}</li>`).join("")}</ul>
      </section>` : ""}
  `;
}
