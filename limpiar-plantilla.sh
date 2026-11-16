#!/bin/sh
# Quita restos de la plantilla original (marca Banrural e imágenes sin uso).
# Ejecutar en la carpeta del portal (donde está src/). Luego: node verificar-imports.mjs
cd "$(dirname "$0")"
for f in \
  src/assets/Edificio_Banrural.png src/assets/Nuevo_Logo_Banrural.png src/assets/OIP.png \
  src/assets/square-logo.png src/assets/con-todo-logo.png src/assets/hero.png \
  src/assets/react.svg src/assets/vite.svg \
  src/components/layout/sidebar/Sidebar.jsx src/components/layout/Header.jsx \
  public/vite.svg; do
  [ -e "$f" ] && rm "$f" && echo "borrado: $f"
done
echo "Listo. Verifique con: node verificar-imports.mjs"
