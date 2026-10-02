/**
 * quiz-engine.js
 *
 * Generic engine for rendering questionnaires (GAD-7, personality tests,
 * future tests). It knows nothing about any specific test — all content
 * comes from a "testData" object (see js/tests/gad7-data.js for the shape).
 *
 * Usage:
 *   const quiz = new QuizEngine({
 *       container: "#quiz-app",
 *       testData: QuizData.gad7
 *   });
 */

class QuizEngine {

    constructor({ container, testData }) {
        this.root = document.querySelector(container);
        this.testData = testData;

        this.currentIndex = 0;
        this.answers = {}; // { questionId: numericValue }

        if (!this.root) {
            console.error(`QuizEngine: container "${container}" not found.`);
            return;
        }

        this.renderIntro();
    }

    /* ----------------------------------------------------------------
     * Screens
     * ---------------------------------------------------------------- */

    renderIntro() {
        const { title, description, instructions, questions, attribution } = this.testData;

        this.root.innerHTML = `
            <div class="quiz-card quiz-intro">
                <h1>${title}</h1>
                <p class="quiz-description">${description}</p>
                ${instructions ? `<p class="quiz-instructions">${instructions}</p>` : ""}
                <p class="quiz-meta">${questions.length} questions &middot; ~${Math.ceil(questions.length * 0.2)} min</p>
                <button class="quiz-btn quiz-btn-primary" id="quiz-start-btn">
                    Start test
                </button>
                ${attribution ? `<p class="quiz-attribution">${attribution}</p>` : ""}
            </div>
        `;

        this.root.querySelector("#quiz-start-btn")
            .addEventListener("click", () => this.start());
    }

    start() {
        this.currentIndex = 0;
        this.answers = {};
        this.renderQuestion();
    }

    renderQuestion() {
        const { questions, scaleLabels } = this.testData;
        const question = questions[this.currentIndex];
        const progress = ((this.currentIndex) / questions.length) * 100;
        const selectedValue = this.answers[question.id];

        const optionsHtml = scaleLabels.map((label, value) => `
            <button
                class="quiz-option ${selectedValue === value ? "selected" : ""}"
                data-value="${value}"
            >
                ${label}
            </button>
        `).join("");

        this.root.innerHTML = `
            <div class="quiz-card">

                <div class="quiz-progress">
                    <div class="quiz-progress-bar" style="width: ${progress}%"></div>
                </div>

                <p class="quiz-step">
                    Question ${this.currentIndex + 1} of ${questions.length}
                </p>

                <h2 class="quiz-question">${question.text}</h2>

                <div class="quiz-options">
                    ${optionsHtml}
                </div>

                <div class="quiz-nav">
                    <button class="quiz-btn quiz-btn-secondary" id="quiz-back-btn"
                        ${this.currentIndex === 0 ? "disabled" : ""}>
                        Back
                    </button>
                    <button class="quiz-btn quiz-btn-primary" id="quiz-next-btn"
                        ${selectedValue === undefined ? "disabled" : ""}>
                        ${this.currentIndex === questions.length - 1 ? "See results" : "Next"}
                    </button>
                </div>

            </div>
        `;

        this.bindQuestionEvents(question);
    }

    bindQuestionEvents(question) {
        const options = this.root.querySelectorAll(".quiz-option");
        const nextBtn = this.root.querySelector("#quiz-next-btn");
        const backBtn = this.root.querySelector("#quiz-back-btn");

        options.forEach((option) => {
            option.addEventListener("click", () => {
                const value = Number(option.dataset.value);
                this.answers[question.id] = value;

                options.forEach((o) => o.classList.remove("selected"));
                option.classList.add("selected");

                nextBtn.disabled = false;
            });
        });

        nextBtn.addEventListener("click", () => this.next());
        backBtn.addEventListener("click", () => this.back());
    }

    next() {
        const isLastQuestion =
            this.currentIndex === this.testData.questions.length - 1;

        if (isLastQuestion) {
            this.renderResults();
        } else {
            this.currentIndex++;
            this.renderQuestion();
        }
    }

    back() {
        if (this.currentIndex === 0) return;
        this.currentIndex--;
        this.renderQuestion();
    }

    /* ----------------------------------------------------------------
     * Scoring
     * ---------------------------------------------------------------- */

    /**
     * Groups answers by dimension and returns, for each dimension:
     * raw score, max possible score, and percentage.
     *
     * A question can contribute to more than one dimension at once —
     * e.g. an item can count both toward an overall "total" score and
     * toward a narrower sub-dimension like "inattention". Use
     * `question.dimensions: [...]` (array) for that. For simple
     * single-dimension tests (e.g. GAD-7), `question.dimension: "x"`
     * (string) still works and is treated as `["x"]`.
     */
    calculateScores() {
        const { questions, dimensions } = this.testData;
        const maxValuePerQuestion = this.testData.scaleLabels.length - 1;

        const scores = {};
        dimensions.forEach((dim) => {
            scores[dim.id] = { raw: 0, max: 0 };
        });

        questions.forEach((question) => {
            const value = this.answers[question.id] ?? 0;
            const questionDimensions =
                question.dimensions || (question.dimension ? [question.dimension] : []);

            questionDimensions.forEach((dimensionId) => {
                if (!scores[dimensionId]) return; // ignore unknown/unlisted dimension ids
                scores[dimensionId].raw += value;
                scores[dimensionId].max += maxValuePerQuestion;
            });
        });

        dimensions.forEach((dim) => {
            const { raw, max } = scores[dim.id];
            scores[dim.id].percentage = max === 0 ? 0 : Math.round((raw / max) * 100);
        });

        return scores;
    }

    /**
     * Finds the matching interpretation range for a given dimension,
     * based on the raw score (not percentage), since standard scales
     * like the GAD-7 define clinical cutoffs on the raw score.
     */
    findInterpretation(dimensionId, rawScore) {
        const dimension = this.testData.dimensions.find((d) => d.id === dimensionId);
        if (!dimension || !dimension.interpretation) return null;

        return dimension.interpretation.find(
            (range) => rawScore >= range.min && rawScore <= range.max
        ) || null;
    }

    /* ----------------------------------------------------------------
     * Results screen
     * ---------------------------------------------------------------- */

    renderResults() {
        const scores = this.calculateScores();
        const { dimensions, title, attribution } = this.testData;

        const resultsHtml = dimensions.map((dim) => {
            const { raw, percentage } = scores[dim.id];
            const interpretation = this.findInterpretation(dim.id, raw);

            return `
                <div class="result-item">
                    <div class="result-label">
                        <span class="result-name">${dim.icon || ""} ${dim.name}</span>
                        <span class="result-percentage">${percentage}%</span>
                    </div>
                    <div class="bar-background">
                        <div class="bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    ${interpretation ? `<p class="quiz-interpretation">${interpretation.label} (score: ${raw})</p>` : ""}
                </div>
            `;
        }).join("");

        this.root.innerHTML = `
            <div class="quiz-card">
                <h2>Your results — ${title}</h2>

                <div class="results">
                    ${resultsHtml}
                </div>

                <p class="quiz-disclaimer">
                    This test is not a clinical diagnosis. If you're concerned
                    about your results, consider talking to a mental health
                    professional.
                </p>
                ${attribution ? `<p class="quiz-attribution">${attribution}</p>` : ""}

                <div class="quiz-nav">
                    <button class="quiz-btn quiz-btn-secondary" id="quiz-restart-btn">
                        Retake test
                    </button>
                    <a class="quiz-btn quiz-btn-primary" href="../index.html">
                        Back to home
                    </a>
                </div>
            </div>
        `;

        this.root.querySelector("#quiz-restart-btn")
            .addEventListener("click", () => this.start());
    }
}
