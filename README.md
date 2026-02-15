# 🦅 FirewallFalcon Manager

**FirewallFalcon Manager** — A powerful and unified **proxy/VPN management script** for Linux servers.
It supports multiple tunneling protocols, user management, SSL automation, and an Nginx gateway that handles all traffic efficiently.

---

## ⚡️ Quick Installation

Run the following command to install the latest version:

```bash
curl -L -o install.sh "https://raw.githubusercontent.com/firewallfalcons/FirewallFalcon-Manager/main/install.sh" && chmod +x install.sh && sudo ./install.sh && rm install.sh
```

> ⚠️ **Important:**
> Before installation:
>
> * **Backup** your user data
> * **Uninstall** any old version of FirewallFalcon Manager
> * Then perform a **clean install** using the command above

---

## 🚀 Features

### 🔰 Multi-Protocol Support

Easily manage and run a wide range of VPN and proxy protocols:

* **V2Ray / XRay** — Supports all major tunneling protocols
* **DNSTT (SlowDNS)** — DNS-based tunneling for restricted networks
* **UDPcustom** — Custom UDP-based VPN tunneling
* **SSH WebSocket (WS)** — Works with and without TLS

---

### 🌐 Nginx Gateway Orchestration

Nginx acts as a **smart entry point** for all connections:

* Handles traffic on **ports 80 and 443**
* Automatically routes requests to the correct backend (**V2Ray/Xray**, **SSH WS**, or **Falcon Proxy**)
* Manages **SSL/TLS termination** for secure connections

---

### 🧠 Falcon Proxy (WebSockets and SOCKS)

**Falcon Proxy** is a built-in **WebSocket** and **SOCKS** proxy that:

* Returns **fake HTTP responses** (`101 Switching Protocols`, `200 OK`)
* Accepts **all payloads**
* Must run on **port 8080 (no SSL)** to integrate perfectly with Nginx
  *(Ensures flawless SSH WS performance on ports 80/443)*

---

### 🧩 Management Tools

* 👤 **SSH User Management** — Add, list, and remove users easily
* 💾 **Backup & Restore** — Save or restore SSH user data anytime
* 🖼️ **SSH Banner Customization** — Display your own login banner
* 🌍 **Free Domain Generator** — Instantly get a free subdomain
* 🔐 **SSL Certificate Generator** — Automatically generate and apply SSL certificates for your own or free domain via Nginx

---

### 🖥️ Web UI (Browser Access)

You can run the manager menu from a browser (same interactive features as the terminal menu):

```bash
menu --web-ui
```

Then open:

```text
http://127.0.0.1:8088
```

---

## 🧱 System Requirements

* Ubuntu / Debian-based Linux (Ubuntu 20.04+ recommended)
* Root access
* Open ports: **80**, **443**, **8080**

---

## 📸 Connection Flow Diagram

```
Client → Nginx (80/443)
          ├──> V2Ray/XRay backend  
          └──>  Falcon Proxy (WebSocket → SSH)  
          
```

---

## 🦅 About

FirewallFalcon Manager simplifies the deployment and management of advanced tunneling setups.
With one script, you can orchestrate multiple VPN and proxy technologies — **securely**, **efficiently**, and **flexibly**.

---

## 🌐 Connect with Us

📣 **Telegram Channel:** [t.me/FirewallFalcons](https://t.me/FirewallFalcons)
💻 **GitHub:** [github.com/FirewallFalcons](https://github.com/FirewallFalcons)

---

🦅 *FirewallFalcon Manager — Simple. Powerful. Unified.*
