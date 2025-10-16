<div align="center">
	<sup>Special thanks to:</sup><br />
	<a href="https://go.warp.dev/Trilium" target="_blank">		
		<img alt="Warp sponsorship" width="400" src="https://github.com/warpdotdev/brand-assets/blob/main/Github/Sponsor/Warp-Github-LG-03.png"><br />
		Warp, built for coding with multiple AI agents<br />
	</a>
  <sup>Available for macOS, Linux and Windows</sup>
</div>

<hr />

# Trilium Notes

![Patrocinadores en GitHub](https://img.shields.io/github/sponsors/eliandoran)
![Patrocinadores en
LiberaPay](https://img.shields.io/liberapay/patrons/ElianDoran)\
![Descargas en Docker](https://img.shields.io/docker/pulls/triliumnext/trilium)
![Descargas en GitHub (todos los recursos, todas las
versiones)](https://img.shields.io/github/downloads/triliumnext/trilium/total)\
[![RelativeCI](https://badges.relative-ci.com/badges/Di5q7dz9daNDZ9UXi0Bp?branch=develop)](https://app.relative-ci.com/projects/Di5q7dz9daNDZ9UXi0Bp)
[![Estado de la
traducción](https://hosted.weblate.org/widget/trilium/svg-badge.svg)](https://hosted.weblate.org/engage/trilium/)

[Inglés](./README.md) | [Chino (simplificado)](./docs/README-ZH_CN.md) | [Chino
(tradicional)](./docs/README-ZH_TW.md) | [Ruso](./docs/README-ru.md) |
[Japonés](./docs/README-ja.md) | [Italiano](./docs/README-it.md) |
[Español](./docs/README-es.md)

Trilium Notes es una aplicación gratuita, de código abierto y multiplataforma
para notas jerárquicas, orientada a crear amplias bases de conocimiento
personal.

Ver [capturas de
pantalla](https://triliumnext.github.io/Docs/Wiki/screenshot-tour) para un
resumen rápido:

<a href="https://triliumnext.github.io/Docs/Wiki/screenshot-tour"><img src="./docs/app.png" alt="Trilium Screenshot" width="1000"></a>

## 📚 Documentación

**Accede a la documentación completa en
[docs.triliumnotes.org](https://docs.triliumnotes.org/)**

La documentación está disponible en varios formatos:
- **Documentación en línea**: Consulta la documentación completa en
  [docs.triliumnotes.org](https://docs.triliumnotes.org/)
- **Ayuda en la aplicación**: Presiona `F1` dentro de Trilium para acceder a la
  misma documentación directamente en la aplicación
- **GitHub**: Navega por la [Guía del
  Usuario](./docs/User%20Guide/User%20Guide/) en este repositorio

### Enlaces rápidos
- [Guía de inicio](https://docs.triliumnotes.org/)
- [Instrucciones de
  instalación](./docs/User%20Guide/User%20Guide/Installation%20&%20Setup/Server%20Installation.md)
- [Configuración de
  Docker](./docs/User%20Guide/User%20Guide/Installation%20&%20Setup/Server%20Installation/1.%20Installing%20the%20server/Using%20Docker.md)
- [Actualización de
  TriliumNext](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Upgrading%20TriliumNext.md)
- [Conceptos básicos y
  funciones](./docs/User%20Guide/User%20Guide/Basic%20Concepts%20and%20Features/Notes.md)
- [Patrones para una base de conocimiento
  personal](https://triliumnext.github.io/Docs/Wiki/patterns-of-personal-knowledge)

## 🎁 Características

* Las notas se pueden organizar en un árbol de profundidad arbitraria. Una sola
  nota puede colocarse en varios lugares del árbol (ver
  [clonado](https://triliumnext.github.io/Docs/Wiki/cloning-notes))
* Editor de notas WYSIWYG completo, que incluye, por ejemplo, tablas, imágenes y
  [matemáticas](https://triliumnext.github.io/Docs/Wiki/text-notes) con
  [autoformato](https://triliumnext.github.io/Docs/Wiki/text-notes#autoformat)
  en Markdown
* Soporte para editar [notas con código
  fuente](https://triliumnext.github.io/Docs/Wiki/code-notes), incluyendo
  resaltado de sintaxis
* [Navegación entre
  notas](https://triliumnext.github.io/Docs/Wiki/note-navigation) rápida y
  sencilla, búsqueda de texto completo y [elevación de
  notas](https://triliumnext.github.io/Docs/Wiki/note-hoisting)
* Flujo continuo de [versionado de
  notas](https://triliumnext.github.io/Docs/Wiki/note-revisions)
* Los [atributos](https://triliumnext.github.io/Docs/Wiki/attributes) de las
  notas se pueden usar para organización, consultas y
  [scripting](https://triliumnext.github.io/Docs/Wiki/scripts) avanzado
* Interfaz disponible en inglés, alemán, español, francés, rumano y chino
  (simplificado y tradicional)
* Integración directa de [OpenID y
  TOTP](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Server%20Installation/Multi-Factor%20Authentication.md)
  para un inicio de sesión más seguro
* [Sincronización](https://triliumnext.github.io/Docs/Wiki/synchronization) con
  servidor de sincronización autohospedado
  * existe un [servicio de terceros para alojar el servidor de
    sincronización](https://trilium.cc/paid-hosting)
* [Compartir](https://triliumnext.github.io/Docs/Wiki/sharing) (publicar) notas
  en Internet público
* Fuerte [cifrado de
  notas](https://triliumnext.github.io/Docs/Wiki/protected-notes) con
  granularidad por nota
* Esbozo de diagramas, basado en [Excalidraw](https://excalidraw.com/) (tipo de
  nota "lienzo")
* [Mapas de relaciones](https://triliumnext.github.io/Docs/Wiki/relation-map) y
  [mapas de enlaces](https://triliumnext.github.io/Docs/Wiki/link-map) para
  visualizar las notas y sus relaciones
* Mapas mentales, basados en [Mind Elixir](https://docs.mind-elixir.com/)
* [Mapas
  geográficos](./docs/User%20Guide/User%20Guide/Note%20Types/Geo%20Map.md) con
  marcadores de ubicación y rutas GPX
* [Scripting](https://triliumnext.github.io/Docs/Wiki/scripts) - ver [Casos de
  uso avanzados](https://triliumnext.github.io/Docs/Wiki/advanced-showcases)
* [REST API](https://triliumnext.github.io/Docs/Wiki/etapi) para automatización
* Escala bien tanto en usabilidad como en rendimiento, incluso con más de
  100.000 notas
* [Interfaz móvil](https://triliumnext.github.io/Docs/Wiki/mobile-frontend)
  optimizada para pantallas táctiles, móviles y tabletas
* [Tema oscuro](https://triliumnext.github.io/Docs/Wiki/themes) integrado, con
  soporte para temas personalizados
* Importación y exportación de
  [Evernote](https://triliumnext.github.io/Docs/Wiki/evernote-import) y
  [Markdown](https://triliumnext.github.io/Docs/Wiki/markdown)
* [Web Clipper](https://triliumnext.github.io/Docs/Wiki/web-clipper) para
  guardar fácilmente contenido web
* Interfaz personalizable (botones de la barra lateral, widgets definidos por el
  usuario, …)
* [Métricas](./docs/User%20Guide/User%20Guide/Advanced%20Usage/Metrics.md),
  junto con un [Dashboard de
  Grafana](./docs/User%20Guide/User%20Guide/Advanced%20Usage/Metrics/grafana-dashboard.json)

✨ Consulta los siguientes recursos y comunidades de terceros para obtener más
contenido relacionado con TriliumNext:

- [awesome-trilium](https://github.com/Nriver/awesome-trilium) para acceder a
  temas, scripts, complementos y otros recursos de terceros.
- [TriliumRocks!](https://trilium.rocks/) para tutoriales, guías y mucho más.

## ❓¿Por qué TriliumNext?

El desarrollador original de Trilium ([Zadam](https://github.com/zadam)) ha
cedido amablemente el repositorio de Trilium al proyecto comunitario, disponible
en https://github.com/TriliumNext

### ⬆️ ¿Migrando desde Zadam/Trilium?

No se requieren pasos especiales para migrar de una instancia de Zadam/Trilium a
TriliumNext/Trilium. Simplemente [instala TriliumNext/Trilium](#-installation)
como de costumbre, y utilizará la base de datos existente.

Las versiones hasta
[v0.90.4](https://github.com/TriliumNext/Trilium/releases/tag/v0.90.4),
inclusive, son compatibles con la última versión de Zadam/Trilium
[v0.63.7](https://github.com/zadam/trilium/releases/tag/v0.63.7). Las versiones
posteriores de TriliumNext/Trilium incrementan su versión de sincronización, lo
que impide migrar directamente.

## 💬 Únete a la conversación

Siéntete libre de unirte a nuestras conversaciones oficiales. ¡Nos interesa
mucho conocer tus funciones favoritas, sugerencias o posibles incidencias!

- [Matrix](https://matrix.to/#/#triliumnext:matrix.org) (Para discusiones
  síncronas.)
  - La sala `General` de Matrix también está enlazada con
    [XMPP](xmpp:discuss@trilium.thisgreat.party?join)
- [Discusiones de GitHub](https://github.com/TriliumNext/Trilium/discussions)
  (para discusiones asincrónicas.)
- [Problemas de GitHub](https://github.com/TriliumNext/Trilium/issues) (para
  reportes de errores y solicitudes de funciones.)

## 🏗 Instalación

### Windows / macOS

Download the binary release for your platform from the [latest release
page](https://github.com/TriliumNext/Trilium/releases/latest), unzip the package
and run the `trilium` executable.

### Linux

If your distribution is listed in the table below, use your distribution's
package.

[![Packaging
status](https://repology.org/badge/vertical-allrepos/triliumnext.svg)](https://repology.org/project/triliumnext/versions)

You may also download the binary release for your platform from the [latest
release page](https://github.com/TriliumNext/Trilium/releases/latest), unzip the
package and run the `trilium` executable.

TriliumNext is also provided as a Flatpak, but not yet published on FlatHub.

### Browser (any OS)

If you use a server installation (see below), you can directly access the web
interface (which is almost identical to the desktop app).

Currently only the latest versions of Chrome & Firefox are supported (and
tested).

### Mobile

To use TriliumNext on a mobile device, you can use a mobile web browser to
access the mobile interface of a server installation (see below).

See issue https://github.com/TriliumNext/Trilium/issues/4962 for more
information on mobile app support.

If you prefer a native Android app, you can use
[TriliumDroid](https://apt.izzysoft.de/fdroid/index/apk/eu.fliegendewurst.triliumdroid).
Report bugs and missing features at [their
repository](https://github.com/FliegendeWurst/TriliumDroid). Note: It is best to
disable automatic updates on your server installation (see below) when using
TriliumDroid since the sync version must match between Trilium and TriliumDroid.

### Server

To install TriliumNext on your own server (including via Docker from
[Dockerhub](https://hub.docker.com/r/triliumnext/trilium)) follow [the server
installation docs](https://triliumnext.github.io/Docs/Wiki/server-installation).


## 💻 Contribute

### Translations

If you are a native speaker, help us translate Trilium by heading over to our
[Weblate page](https://hosted.weblate.org/engage/trilium/).

Here's the language coverage we have so far:

[![Translation
status](https://hosted.weblate.org/widget/trilium/multi-auto.svg)](https://hosted.weblate.org/engage/trilium/)

### Code

Download the repository, install dependencies using `pnpm` and then run the
server (available at http://localhost:8080):
```shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm run server:start
```

### Documentation

Download the repository, install dependencies using `pnpm` and then run the
environment required to edit the documentation:
```shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm edit-docs:edit-docs
```

### Building the Executable
Download the repository, install dependencies using `pnpm` and then build the
desktop app for Windows:
```shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm run --filter desktop electron-forge:make --arch=x64 --platform=win32
```

For more details, see the [development
docs](https://github.com/TriliumNext/Trilium/tree/main/docs/Developer%20Guide/Developer%20Guide).

### Developer Documentation

Please view the [documentation
guide](https://github.com/TriliumNext/Trilium/blob/main/docs/Developer%20Guide/Developer%20Guide/Environment%20Setup.md)
for details. If you have more questions, feel free to reach out via the links
described in the "Discuss with us" section above.

## 👏 Shoutouts

* [zadam](https://github.com/zadam) for the original concept and implementation
  of the application.
* [Sarah Hussein](https://github.com/Sarah-Hussein) for designing the
  application icon.
* [nriver](https://github.com/nriver) for his work on internationalization.
* [Thomas Frei](https://github.com/thfrei) for his original work on the Canvas.
* [antoniotejada](https://github.com/nriver) for the original syntax highlight
  widget.
* [Dosu](https://dosu.dev/) for providing us with the automated responses to
  GitHub issues and discussions.
* [Tabler Icons](https://tabler.io/icons) for the system tray icons.

Trilium would not be possible without the technologies behind it:

* [CKEditor 5](https://github.com/ckeditor/ckeditor5) - the visual editor behind
  text notes. We are grateful for being offered a set of the premium features.
* [CodeMirror](https://github.com/codemirror/CodeMirror) - code editor with
  support for huge amount of languages.
* [Excalidraw](https://github.com/excalidraw/excalidraw) - the infinite
  whiteboard used in Canvas notes.
* [Mind Elixir](https://github.com/SSShooter/mind-elixir-core) - providing the
  mind map functionality.
* [Leaflet](https://github.com/Leaflet/Leaflet) - for rendering geographical
  maps.
* [Tabulator](https://github.com/olifolkerd/tabulator) - for the interactive
  table used in collections.
* [FancyTree](https://github.com/mar10/fancytree) - feature-rich tree library
  without real competition.
* [jsPlumb](https://github.com/jsplumb/jsplumb) - visual connectivity library.
  Used in [relation
  maps](https://triliumnext.github.io/Docs/Wiki/relation-map.html) and [link
  maps](https://triliumnext.github.io/Docs/Wiki/note-map.html#link-map)

## 🤝 Support

Trilium is built and maintained with [hundreds of hours of
work](https://github.com/TriliumNext/Trilium/graphs/commit-activity). Your
support keeps it open-source, improves features, and covers costs such as
hosting.

Consider supporting the main developer
([eliandoran](https://github.com/eliandoran)) of the application via:

- [GitHub Sponsors](https://github.com/sponsors/eliandoran)
- [PayPal](https://paypal.me/eliandoran)
- [Buy Me a Coffee](https://buymeacoffee.com/eliandoran)

## 🔑 License

Copyright 2017-2025 zadam, Elian Doran, and other contributors

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.
