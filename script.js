// Sample project data
const projectData = {
    java: {
        title: "Java Projects",
        subtitle: "Enterprise applications and backend development",
        projects: [
        //     {
        //         title: "E-commerce Platform",
        //         description:
        //             "A full-scale e-commerce platform built with Spring Boot, featuring user authentication, payment processing, and inventory management.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Task Management API",
        //         description:
        //             "RESTful API for task management with JWT authentication, built using Spring Boot and PostgreSQL.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Data Processing Pipeline",
        //         description:
        //             "A robust data processing pipeline using Apache Kafka and Spring Boot for real-time data analytics.",
        //         github: "#",
        //         demo: "#",
        //     },
        ],
    },
    golang: {
        title: "Go Projects",
        subtitle: "High-performance backend services and tools",
        projects: [
        //     {
        //         title: "Microservices Architecture",
        //         description:
        //             "A complete microservices setup with API Gateway, service discovery, and distributed tracing using Go.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "CLI Tool",
        //         description:
        //             "A command-line tool for developers to manage and deploy applications efficiently.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Real-time Chat Server",
        //         description:
        //             "High-performance chat server with WebSocket support, handling thousands of concurrent connections.",
        //         github: "#",
        //         demo: "#",
        //     },
        ],
    },
    cpp: {
        title: "C++ Projects",
        subtitle: "System programming and performance-critical applications",
        projects: [
        //     {
        //         title: "Game Engine",
        //         description:
        //             "A lightweight 2D game engine with OpenGL rendering and physics simulation capabilities.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Database Engine",
        //         description:
        //             "A simple but functional database engine with B-tree indexing and transaction support.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Network Protocol Implementation",
        //         description:
        //             "Custom implementation of TCP/IP protocol stack for educational purposes.",
        //         github: "#",
        //         demo: "#",
        //     },
        ],
    },
    typescript: {
        title: "TypeScript Projects",
        subtitle: "Modern web applications and frontend development",
        projects: [
        //     {
        //         title: "Project Management Dashboard",
        //         description:
        //             "A comprehensive project management dashboard built with React, TypeScript, and Redux Toolkit.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Real-time Collaboration Tool",
        //         description:
        //             "A collaborative document editing tool similar to Google Docs, built with Next.js and Socket.io.",
        //         github: "#",
        //         demo: "#",
        //     },
        //     {
        //         title: "Mobile App with React Native",
        //         description:
        //             "Cross-platform mobile application for expense tracking with offline capabilities.",
        //         github: "#",
        //         demo: "#",
        //     },
        ],
    },
};

// Theme functionality
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.querySelector(".theme-toggle");

    if (body.getAttribute("data-theme") === "dark") {
        body.removeAttribute("data-theme");
        themeToggle.textContent = "🌙";
        localStorage.setItem("theme", "light");
    } else {
        body.setAttribute("data-theme", "dark");
        themeToggle.textContent = "☀️";
        localStorage.setItem("theme", "dark");
    }
}

// Load saved theme
function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    const themeToggle = document.querySelector(".theme-toggle");

    if (savedTheme === "dark") {
        document.body.setAttribute("data-theme", "dark");
        themeToggle.textContent = "☀️";
    } else {
        themeToggle.textContent = "🌙";
    }
}

// Navigation functionality
function showHome() {
    document.getElementById("home").classList.add("active");
    document.getElementById("projects").classList.remove("active");
    document.getElementById("articles").classList.remove("active");
    document.getElementById("blog").classList.remove("active");

    // Reset display
    document.getElementById("home").style.display = "block";
    document.getElementById("projects").style.display = "none";
    document.getElementById("articles").style.display = "none";
    document.getElementById("blog").style.display = "none";
}

function showProjects(tech) {
    const data = projectData[tech];

    document.getElementById("projectsTitle").textContent = data.title;
    document.getElementById("projectsSubtitle").textContent = data.subtitle;

    const projectsGrid = document.getElementById("projectsGrid");
    projectsGrid.innerHTML = "";

    data.projects.forEach((project) => {
        const projectCard = document.createElement("div");
        projectCard.className = "project-card";
        projectCard.innerHTML = `
                    <h3>${project.title}</h3>
                    <p>${project.description}</p>
                    <div class="project-links">
                        <a href="${project.github}">GitHub</a>
                        <a href="${project.demo}">Demo</a>
                    </div>
                `;
        projectsGrid.appendChild(projectCard);
    });

    document.getElementById("home").style.display = "none";
    document.getElementById("projects").style.display = "block";
    document.getElementById("articles").style.display = "none";
    document.getElementById("blog").style.display = "none";
}

function showArticles() {
    document.getElementById("home").style.display = "none";
    document.getElementById("projects").style.display = "none";
    document.getElementById("articles").style.display = "block";
    document.getElementById("blog").style.display = "none";
}

function showBlog() {
    document.getElementById("home").style.display = "none";
    document.getElementById("projects").style.display = "none";
    document.getElementById("articles").style.display = "none";
    document.getElementById("blog").style.display = "block";
}

// Mobile menu functionality
function toggleMobileMenu() {
    const mobileNav = document.getElementById("mobileNav");
    mobileNav.classList.toggle("active");
}

// Close mobile menu when clicking outside
document.addEventListener("click", function (event) {
    const mobileNav = document.getElementById("mobileNav");
    const mobileMenuBtn = document.querySelector(".mobile-menu-btn");

    if (
        !mobileNav.contains(event.target) &&
        !mobileMenuBtn.contains(event.target)
    ) {
        mobileNav.classList.remove("active");
    }
});

// Initialize
document.addEventListener("DOMContentLoaded", function () {
    loadTheme();
    showHome();

    if (window.location.hash === "#blog") {
        showBlog();
    } else {
        showHome();
    }
});
