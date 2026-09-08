# PyM Technologies - Sitio Web

Sitio web profesional para PyM Technologies, empresa especializada en automatización y sistemas inteligentes.

## 📋 Características

- ✅ Diseño responsive y moderno
- ✅ Menú hamburguesa para dispositivos móviles
- ✅ Sección de servicios con tarjetas interactivas
- ✅ Formulario de contacto funcional
- ✅ Animaciones suaves
- ✅ Navegación activa
- ✅ Optimizado para SEO
- ✅ Validación de formularios

## 📁 Estructura del Proyecto

```
pym-technologies/
├── index.html          # Archivo HTML principal
├── css/
│   └── styles.css      # Estilos CSS
├── js/
│   └── script.js       # JavaScript interactivo
├── README.md           # Este archivo
├── .gitignore          # Archivos a ignorar en Git
└── LICENSE             # Licencia del proyecto
```

## 🚀 Cómo Usar

### Instalación Local

1. Clona el repositorio:
```bash
git clone https://github.com/tu-usuario/pym-technologies.git
cd pym-technologies
```

2. Abre el archivo `index.html` en tu navegador:
```bash
open index.html  # macOS
start index.html # Windows
xdg-open index.html # Linux
```

O usa un servidor local:
```bash
# Con Python 3
python -m http.server 8000

# Con Node.js (si tienes http-server instalado)
http-server
```

Luego accede a `http://localhost:8000`

### Deployment

#### GitHub Pages

1. Pushea el repositorio a GitHub
2. Ve a Settings > Pages
3. Selecciona "Deploy from a branch"
4. Elige la rama `main` o `master`
5. El sitio estará disponible en `https://tu-usuario.github.io/pym-technologies`

#### Netlify

1. Conecta tu repositorio de GitHub a Netlify
2. Configura:
   - Build command: (dejar vacío para sitio estático)
   - Publish directory: `.` (raíz)
3. Haz deploy automáticamente con cada push

#### Vercel

1. Importa el repositorio en Vercel
2. Vercel detectará automáticamente que es un sitio estático
3. Haz clic en "Deploy"

#### Servidor Propio

1. Copia los archivos a tu servidor
2. Asegúrate de que el servidor sirve archivos HTML estáticos
3. Configura el dominio en tu proveedor DNS

## 🛠️ Tecnologías Utilizadas

- **HTML5** - Estructura semántica
- **CSS3** - Estilos y animaciones
- **JavaScript** - Interactividad
- **Font Awesome 6** - Iconos
- **Responsive Design** - Diseño móvil

## 📱 Compatibilidad

- ✅ Chrome (últimas versiones)
- ✅ Firefox (últimas versiones)
- ✅ Safari (últimas versiones)
- ✅ Edge (últimas versiones)
- ✅ Dispositivos móviles (iOS y Android)

## 🎨 Colores

- Color Primario: `#667eea` (Azul Púrpura)
- Color Secundario: `#764ba2` (Púrpura)
- Fondo Claro: `#f8f9fa`
- Texto: `#333`

## 📝 Configuración

### Variables CSS

Todas las variables de color y estilos están definidas en el `:root` de `css/styles.css`:

```css
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --text-color: #333;
    /* ... más variables */
}
```

Puedes cambiar estos valores para personalizar el diseño.

### Formulario de Contacto

El formulario de contacto actualmente muestra un alert. Para implementar envío real:

1. Descomenta el código en `js/script.js` (línea ~65)
2. Reemplaza `https://tu-servidor.com/api/contact` con tu endpoint
3. Implementa un backend para procesar los datos

**Opciones recomendadas:**
- FormSubmit (gratuito)
- Netlify Forms
- EmailJS
- Tu propio backend

## 🔧 Personalización

### Cambiar Información de Contacto

Edita el archivo `index.html`:
- Línea ~143: Teléfono
- Línea ~148: Email
- Línea ~153: Ubicación

### Agregar Nuevos Servicios

Copia el siguiente bloque en la sección de servicios:

```html
<div class="service-card">
    <i class="fas fa-nombre-icono"></i>
    <h3>Nombre del Servicio</h3>
    <p>Descripción del servicio.</p>
</div>
```

Consulta [Font Awesome Icons](https://fontawesome.com/icons) para ver iconos disponibles.

## 📞 Contacto

**PyM Technologies**
- 📧 Email: info@pymtech.com
- 📱 Teléfono: +54 (11) 1234-5678
- 📍 Ubicación: Buenos Aires, Argentina

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver archivo `LICENSE` para más detalles.

## ✨ Mejoras Futuras

- [ ] Agregar blog
- [ ] Implementar galería de proyectos
- [ ] Integración con redes sociales
- [ ] Modo oscuro
- [ ] Soporte multiidioma
- [ ] Analytics e integración con Google Analytics
- [ ] Certificado SSL
- [ ] Cache y optimización de rendimiento

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📊 Estadísticas de Archivo

- HTML: ~150 líneas
- CSS: ~400 líneas
- JavaScript: ~150 líneas
- Total: ~700 líneas de código

## 🐛 Reporte de Problemas

Si encuentras algún problema, abre un issue en el repositorio con:
- Descripción del problema
- Pasos para reproducir
- Navegador utilizado
- Screenshots si es relevante

---

**Última actualización:** Septiembre 2024
**Versión:** 1.0.0
