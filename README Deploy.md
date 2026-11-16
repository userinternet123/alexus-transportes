# Deploy

Proyecto creado con **Vite + React + JavaScript**, con soporte para rutas, consumo de API **TypeScript** y librerías modernas de UI.

---

## 📦 Tecnologías utilizadas

- ⚛️ React
- 🟦 JavaScript
- ⚡ Vite
- 🌐 React Router DOM
- 📡 Axios
- 🎨 Tailwind CSS
- 🔔 React Hot Toast
- 🎨 Lucide React (iconos)
- ⚠️ SweetAlert2

---

## 🛠️ Instalación y configuración

verificar si ya estan instalados

```bash
which wget
```

### Instalar dependencias

```bash
sudo dnf install -y wget curl unzip git vim lsof
sudo dnf install -y policycoreutils-python-utils
```

### Crear directorios

```bash
sudo mkdir -p /opt/apps/portal-tarjeta-credito/deploys/frontend
sudo mkdir -p /opt/apps/portal-tarjeta-credito/current/frontend
sudo mkdir -p /opt/apps/portal-tarjeta-credito/current/api
sudo mkdir -p /opt/apps/portal-tarjeta-credito/backups
```

## permisos al usuario

```bash
ls -lah /opt/apps/portal-tarjeta-credito
sudo chown -R admin:admin /opt/apps/portal-tarjeta-credito/deploys
```

## subir al servidor desde Windows

```bash
scp -r .\dist\* admin@10.160.110.61:/opt/apps/portal-tarjeta-credito/deploys/Formulario_TC/FrontEnd/
```

## desempaquetar

```bash
cd /opt/apps/portal-tarjeta-credito/deploys/Formulario_TC/FrontEnd/

rm -rf *
unzip dist.zip
```

## respaldo

```bash
sudo cp -r /opt/apps/portal-tarjeta-credito/current/frontend/* /opt/apps/portal-tarjeta-credito/backups/
tar -czf backup.tar.gz backups/

```

### Crear directorios de web

```bash
sudo mkdir -p /var/www/apps/portal-tarjeta-credito
```

## Copiar el build del frontend

```bash
sudo cp -r /opt/apps/portal-tarjeta-credito/current/frontend/* /var/www/apps/portal-tarjeta-credito/
```

### Instalar NVM

para versionamiento de node

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```

### Instalar Node.js

```bash
sudo dnf install nodejs
```

### Instalar nginx

```bash
sudo dnf install -y nginx
```

### Clonar repositorio

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VhcmlvIjoidXNyMDQzODYwIiwicm9sIjoicGVyc29uYWwiLCJub21icmUiOiJHRFMgVXMgUmVjaW5vcywgSnVhbiIsIm9maWNpbmEiOiI5MTkiLCJyZWdpb24iOjQ1LCJtYWNybyI6IkJBTkNBIENPUlBPUkFUSVZBIiwicm9sZXMiOlt7ImlkUm9sIjoxLCJyb2wiOiJBZG1pbmlzdHJhZG9yIGRlIHNpc3RlbWEiLCJmZWNoYUluaWNpbyI6IjIwMjYtMDgtMTgiLCJmZWNoYUZpbiI6bnVsbH1dLCJpYXQiOjE3ODc5NTczMzIsImV4cCI6MTc4Nzk4NjEzMn0.dXV7ZjbFQmM_O3HrkJtdfB2vX3Ik2IPZ2OaCQf7iX9A

curl -i \
-X GET \
"http://127.0.0.1:4000/api/v1/agencia/919/region/45/macroregion/BANCA%20CORPORATIVA/usuario/usr043860/ventas?page=1&limit=0" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VhcmlvIjoidXNyMDQzODYwIiwicm9sIjoicGVyc29uYWwiLCJub21icmUiOiJHRFMgVXMgUmVjaW5vcywgSnVhbiIsIm9maWNpbmEiOiI5MTkiLCJyZWdpb24iOjQ1LCJtYWNybyI6IkJBTkNBIENPUlBPUkFUSVZBIiwicm9sZXMiOlt7ImlkUm9sIjoxLCJyb2wiOiJBZG1pbmlzdHJhZG9yIGRlIHNpc3RlbWEiLCJmZWNoYUluaWNpbyI6IjIwMjYtMDgtMTgiLCJmZWNoYUZpbiI6bnVsbH1dLCJpYXQiOjE3ODc5NTczMzIsImV4cCI6MTc4Nzk4NjEzMn0.dXV7ZjbFQmM_O3HrkJtdfB2vX3Ik2IPZ2OaCQf7iX9A"

ab -n 1000 -c 10 \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c3VhcmlvIjoidXNyMDQzODYwIiwicm9sIjoicGVyc29uYWwiLCJub21icmUiOiJHRFMgVXMgUmVjaW5vcywgSnVhbiIsIm9maWNpbmEiOiI5MTkiLCJyZWdpb24iOjQ1LCJtYWNybyI6IkJBTkNBIENPUlBPUkFUSVZBIiwicm9sZXMiOlt7ImlkUm9sIjoxLCJyb2wiOiJBZG1pbmlzdHJhZG9yIGRlIHNpc3RlbWEiLCJmZWNoYUluaWNpbyI6IjIwMjYtMDgtMTgiLCJmZWNoYUZpbiI6bnVsbH1dLCJpYXQiOjE3ODc5NTczMzIsImV4cCI6MTc4Nzk4NjEzMn0.dXV7ZjbFQmM_O3HrkJtdfB2vX3Ik2IPZ2OaCQf7iX9A" \
"http://127.0.0.1:4000/api/v1/agencia/919/region/45/macroregion/BANCA%20CORPORATIVA/usuario/usr043860/ventas?page=1&limit=0"

ab -n 5000 -c 50 -T applic

```bash
git clone http://sig-git.bdr:3000/usr034281/Formulario_TC.git
cd Formulario_TC
```

## configuración nginx

para que inicie automáticamente al arrancar el sistema

```bash
sudo systemctl enable nginx
```

iniciar el servicio

```bash
sudo systemctl start nginx
```

verificar el estado

```bash
sudo systemctl status nginx
```

dar permisos

```bash
sudo chown -R nginx:nginx /var/www/apps/
```

editar archivo

```bash
sudo vim /etc/nginx/conf.d/portal-tarjeta-credito.conf

server {

    listen 80;

    server_name portal.midominio.com;

    root /var/www/apps/portal-tarjeta-credito/frontend/;
    index index.html;

    location / {

        try_files $uri $uri/ /index.html;

    }

    location /api/ {

        proxy_pass http://127.0.0.1:3000/;

        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;

        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;

        proxy_set_header X-Real-IP $remote_addr;

        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        proxy_set_header X-Forwarded-Proto $scheme;

    }

}
```

validar configuracion

```bash
sudo nginx -t
```

recargar configuracion

```bash
sudo systemctl reload nginx
```

agregar configuracion de firewall

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

verificar que nginx escuche

```bash
sudo ss -tulpn | grep :80
```

ver log

```bash
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u nginx -f
```

contenido bloqueado, liberar temporalmente

```bash
sudo setenforce 0
getenforce
```

solución al bloqueo

```bash
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/apps/portal-tarjeta-credito/frontend(/.*)?"
sudo restorecon -Rv /var/www/apps/portal-tarjeta-credito/frontend
ls -Zd /var/www/apps/portal-tarjeta-credito/frontend
```

configurar selinux si aparece SELINUX=enforcing, dejar sin cambios, ojo que se debe reiniciar el servidor, luego validar como quedó

```bash
cat /etc/selinux/config
sudo vim /etc/selinux/config

sudo reboot
sestatus
```

# CONFIGURACIÓN DE API

## copiar proyecto al server

```bash
scp -r .\FormularioTC\* admin@10.160.209.68:/opt/apps/portal-tarjeta-credito/deploys/api/
```

dar permisos de ejecución para npm run build

```bash
chmod +x node_modules/.bin/tsc

```

editar dist/main.js

```bash
import dotenv from 'dotenv';
dotenv.config();
```

# editar archivo configuración para del serivicio systemd

```bash
sudo vim /etc/systemd/system/portal-api.service

[Unit]
Description=Tarjeta Credito API
After=network.target

[Service]
Type=simple
User=admin

WorkingDirectory=/var/www/apps/portal-tarjeta-credito/api

ExecStart=/usr/bin/node /var/www/apps/portal-tarjeta-credito/api/dist/main.js

Restart=always
RestartSec=5

Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target



[Unit]
Description=Tarjeta Credito API
After=network.target

[Service]
Type=simple
User=admin

WorkingDirectory=/work/api/Proyecto

Environment=NODE_ENV=production
EnvironmentFile=/work/api/Proyecto/.env

Environment=SQLANY17=/opt/sqlanywhere17
Environment=PATH=/opt/sqlanywhere17/bin64:/usr/local/bin:/usr/bin:/bin

ExecStart=/usr/bin/node /work/api/Proyecto/dist/main.js

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target


sudo systemctl daemon-reload
sudo systemctl enable portal-api
sudo systemctl start portal-api
sudo systemctl status portal-api

```

log

```bash
journalctl -u portal-api -f
ss -tulpn | grep 3000
```

## variables de entorno

```bash
export PATH=/opt/sqlanywhere17/bin64:$PATH
export SQLANY17=/opt/sqlanywhere17
```

# Agregar configuración al server nginx

```bash
sudo vi /etc/nginx/conf.d/portal-tarjeta.conf

server {

    listen 80;

    server_name _;

    root /var/www/apps/portal-tarjeta-credito/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {

        proxy_pass http://127.0.0.1:3000/;

        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

    }

}

sudo nginx -t
sudo systemctl reload nginx
curl http://localhost:300
curl http://localhost/api

cambiar front VITE_API_URL=/api
```

console.log('ANTES SQLSERVER');
const auditoria = await SqlServerAuditoria.crear();
console.log('DESPUES SQLSERVER');

console.log('ANTES SAPIQ');
const sapIqRepositorio =
await SapIqRepositorioSolicitud.crear();
console.log('DESPUES SAPIQ'
extraer los archivos tar

```bash
sudo tar -xvf backup_api.tar
```

buscar información del servidor

```bash
cat /etc/readhat-release
sudo dnf search odbc
sudo dnf install -y unixODBC
odbcinst -j
```

```bash
sudo -u admin /usr/bin/ /work/api/Proyecto/dist/main.js
node dist/main.js
sudo -u admin bash -c "cd /work/api/Proyecto && node dist/main.js"
sudo -u admin env SQLANY17=/opt/sqlanywhere17 PATH=/opt/sqlanywhere17/bin64:/usr/bin:/bin node /work/api/Proyecto/dist/main.js
```

# ver los servicios en el sistema

```bash
ps -ef | grep node
kill -9 numeroproceso
```

# 🚀 Guía de configuración Inicial del proyecto

## 1. Crear proyecto

```bash
npm create vite@latest portaladmin
- react
- npm install react-router-dom axios
```

## 1.1 correr el proyecto

- npm run dev

## 1.2 Desplegar el proyecto

- npm run build
- npm run preview (previsualizar Build)

## 1.2 url

- http://localhost:5173/

# 2 instalar dependencias

```
- npm install
- npm install tailwindcss @tailwindcss/vite
- npm install -D tailwindcss@3.4.1 postcss autoprefixer
- npx tailwindcss init -p
- npm install lucide-react
- npm install react-hot-toast
- npm install sweetalert2
- npm install @tanstack/react-table
```

## configuración tailwindcss Vite

````

- import tailwindcss from '@tailwindcss/vite'
- plugins:[tailwindcss()].

```

## configuración de TailWind

- tailwind.config.js

```

tailwind.config.js
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
theme: {
extend: {},
},
plugins: [],

```

- Index.css

```

@tailwind base;
@tailwind components;
@tailwind utilities;

```

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
```

````

┌─────────────────┐
│ Web / Mobile App│
└────────┬────────┘
│
▼
┌─────────────────┐
│ BFF │
│ Backend for FE │
└────────┬────────┘
│
▼
┌─────────────────┐
│ API Gateway │
└────────┬────────┘
│
┌───────┼────────────────────┐
▼ ▼ ▼ ▼
Auth Clientes Cuentas Pagos
API API API API
│ │ │ │
└─────────┼─────────┼─────────┘
▼
Event Bus / Kafka
▼
Servicios Core
▼
Bases de Datos```

      Autenticación.

Autorización.
Rate Limiting.
Logging.
Versionamiento.
Protección DDoS.

```

```
