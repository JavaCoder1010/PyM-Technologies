// ==========================================
// MENÚ HAMBURGUESA
// ==========================================

const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        const isOpen = hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', isOpen);
    });
}

// Cerrar menú al hacer clic en un enlace
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
    });
});

// ==========================================
// SCROLL SUAVE A SECCIONES
// ==========================================

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

// ==========================================
// FORMULARIO DE CONTACTO
// ==========================================

const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const message = document.getElementById('message').value.trim();

        // Validación básica
        if (!name || !email || !message) {
            alert('Por favor, completa todos los campos.');
            return;
        }

        // Validar email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Por favor, ingresa un email válido.');
            return;
        }

        // Aquí puedes enviar los datos al servidor
        // Por ahora, mostramos un mensaje de éxito
        alert(`¡Gracias, ${name}! Tu mensaje ha sido recibido. Nos pondremos en contacto pronto.`);

        // Limpiar formulario
        contactForm.reset();

        // Ejemplo de cómo enviar datos a un servidor (descomenta para usar):
        /*
        const formData = {
            name: name,
            email: email,
            message: message
        };

        fetch('https://tu-servidor.com/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            alert('Mensaje enviado exitosamente');
            contactForm.reset();
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Hubo un error al enviar el mensaje');
        });
        */
    });
}

// ==========================================
// ANIMACIÓN AL SCROLL
// ==========================================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observar las tarjetas de servicios
const serviceCards = document.querySelectorAll('.service-card');
serviceCards.forEach((card, index) => {
    card.style.opacity = '0';
    card.style.animationDelay = `${index * 0.1}s`;
    observer.observe(card);
});

// ==========================================
// NAVEGACIÓN ACTIVA
// ==========================================

window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.nav-link');

    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 60) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// ==========================================
// MODO OSCURO (OPCIONAL - DESCOMENTA PARA USAR)
// ==========================================

/*
const toggleDarkMode = () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
};

// Cargar preferencia de modo oscuro
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}
*/

// ==========================================
// FUNCIONES ÚTILES
// ==========================================

// Función para hacer scroll hacia arriba
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Función para detectar dispositivo móvil
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('PyM Technologies - Sitio web cargado correctamente');
});
