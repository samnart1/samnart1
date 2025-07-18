/**
 * Component loader utility to load navbar and footer into pages
 */

// Load a component into a specific containter
async function loadComponent(componentPath, containerId) {
    try {
        const response = await fetch(componentPath);
        if (!response.ok) {
            throw new Error(`Failed to load component: ${response.status}`);
        }
        const html = await response.text();
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = html;
        } else {
            console.error(`Container with ID '${containerId}' not found`);
        }
    } catch (error) {
        console.error("Error loading component:", error);
    }
}
// Load navbar and footer components
async function loadComponents() {
    await Promise.all([
        loadComponent("./components/navbar.html", "navbar-container"),
        loadComponent("./components/footer.html", "footer-container"),
    ]);
}

// Alternative method using innerHTML insertion
function insertComponent(componentPath, targetElement) {
    fetch(componentPath)
        .then((response) => response.text())
        .then((html) => {
            targetElement.innerHTML = html;
        })
        .catch((error) => {
            console.error("Error loading component:", error);
        });
}

// Initialize components when DOM is loaded
document.addEventListener("DOMContentLoaded", loadComponents);
