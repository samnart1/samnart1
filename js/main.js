// ==========================================================================
// SAM NART — Main JavaScript
// ==========================================================================

(function() {
    'use strict';

    // --------------------------------------------------------------------------
    // Scroll Animations (Intersection Observer)
    // --------------------------------------------------------------------------
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -50px 0px',
        threshold: 0.1
    };

    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Unobserve after animation to save resources
                scrollObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all elements with animate-in class
    function initScrollAnimations() {
        document.querySelectorAll('.animate-in').forEach(el => {
            scrollObserver.observe(el);
        });
    }

    // Auto-add animate-in class to common elements
    function setupAnimatedElements() {
        const selectors = [
            '.hero__intro',
            '.hero__status',
            '.featured',
            '.project-card',
            '.post-item',
            '.photo-item',
            '.about__section',
            '.filters',
            '.page-title',
            '.lead',
            '.prose'
        ];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (!el.classList.contains('animate-in')) {
                    el.classList.add('animate-in');
                }
            });
        });
        
        // Add stagger to grids
        document.querySelectorAll('.projects-grid, .posts-list, .photo-grid, .contact-links').forEach(grid => {
            grid.classList.add('stagger-children');
        });
    }

    // --------------------------------------------------------------------------
    // Page Transitions
    // --------------------------------------------------------------------------
    function initPageTransitions() {
        // Add loaded class after page renders
        requestAnimationFrame(() => {
            document.body.classList.add('page-loaded');
        });

        // Handle internal link clicks for smooth transitions
        document.querySelectorAll('a[href^="/"]').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                
                // Skip if modifier key pressed or same page
                if (e.metaKey || e.ctrlKey || href === window.location.pathname) {
                    return;
                }
                
                e.preventDefault();
                document.body.classList.add('page-leaving');
                
                setTimeout(() => {
                    window.location.href = href;
                }, 150);
            });
        });
    }

    // --------------------------------------------------------------------------
    // Theme Toggle
    // --------------------------------------------------------------------------
    const themeToggle = document.querySelector('.nav__toggle');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    
    function getTheme() {
        const stored = localStorage.getItem('theme');
        if (stored) return stored;
        return prefersDark.matches ? 'dark' : 'light';
    }
    
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateToggleIcon(theme);
    }
    
    function updateToggleIcon(theme) {
        if (!themeToggle) return;
        const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`;
        const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`;
        themeToggle.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
        themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    
    // Initialize theme
    setTheme(getTheme());
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // --------------------------------------------------------------------------
    // Mobile Navigation
    // --------------------------------------------------------------------------
    const mobileToggle = document.querySelector('.nav__mobile-toggle');
    const navLinks = document.querySelector('.nav__links');
    
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            mobileToggle.setAttribute('aria-expanded', isOpen);
            
            // Update icon
            const menuIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`;
            const closeIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
            mobileToggle.innerHTML = isOpen ? closeIcon : menuIcon;
        });
        
        // Close on link click
        navLinks.querySelectorAll('.nav__link').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                mobileToggle.setAttribute('aria-expanded', 'false');
                mobileToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>`;
            });
        });
    }

    // --------------------------------------------------------------------------
    // Project Filtering
    // --------------------------------------------------------------------------
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');
    
    if (filterButtons.length && projectCards.length) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                
                // Update active button
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Filter projects
                projectCards.forEach(card => {
                    const lang = card.dataset.lang;
                    if (filter === 'all' || lang === filter) {
                        card.setAttribute('data-hidden', 'false');
                        card.style.display = '';
                    } else {
                        card.setAttribute('data-hidden', 'true');
                        card.style.display = 'none';
                    }
                });
            });
        });
    }

    // --------------------------------------------------------------------------
    // Photography Lightbox
    // --------------------------------------------------------------------------
    const photoItems = document.querySelectorAll('.photo-item');
    const lightbox = document.querySelector('.lightbox');
    const lightboxImg = document.querySelector('.lightbox__img');
    const lightboxClose = document.querySelector('.lightbox__close');
    const lightboxPrev = document.querySelector('.lightbox__nav--prev');
    const lightboxNext = document.querySelector('.lightbox__nav--next');
    
    let currentPhotoIndex = 0;
    const photos = [];
    
    if (photoItems.length && lightbox) {
        photoItems.forEach((item, index) => {
            const img = item.querySelector('img');
            photos.push({
                src: img.dataset.full || img.src,
                caption: item.querySelector('.photo-item__caption')?.textContent || ''
            });
            
            item.addEventListener('click', () => {
                currentPhotoIndex = index;
                openLightbox();
            });
        });
        
        function openLightbox() {
            lightboxImg.src = photos[currentPhotoIndex].src;
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        
        function closeLightbox() {
            lightbox.classList.remove('open');
            document.body.style.overflow = '';
        }
        
        function showPrev() {
            currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
            lightboxImg.src = photos[currentPhotoIndex].src;
        }
        
        function showNext() {
            currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
            lightboxImg.src = photos[currentPhotoIndex].src;
        }
        
        if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
        if (lightboxPrev) lightboxPrev.addEventListener('click', showPrev);
        if (lightboxNext) lightboxNext.addEventListener('click', showNext);
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('open')) return;
            
            switch (e.key) {
                case 'Escape':
                    closeLightbox();
                    break;
                case 'ArrowLeft':
                    showPrev();
                    break;
                case 'ArrowRight':
                    showNext();
                    break;
            }
        });
        
        // Click outside to close
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }

    // --------------------------------------------------------------------------
    // Active Navigation Link
    // --------------------------------------------------------------------------
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav__link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
            link.classList.add('active');
        }
    });

    // --------------------------------------------------------------------------
    // Smooth Scroll for Anchor Links
    // --------------------------------------------------------------------------
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // --------------------------------------------------------------------------
    // Initialize Everything
    // --------------------------------------------------------------------------
    setupAnimatedElements();
    initScrollAnimations();
    initPageTransitions();

})();
