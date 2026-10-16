# Tiffin Holo — Order Backend Setup

Website ab orders ek **server** par bhejti hai, isliye **kisi bhi phone se order aaye, tumhe pata chal jayega** — aur order history sab devices par same dikhegi.

---

## Kya kya hoga

| Cheez | Kaise |
|---|---|
| Customer order kare (kisi bhi phone se) | Order server par save hota hai |
| Tumhe turant pata chale | **Telegram message** + **WhatsApp message** |
| Order History | Owner login ke baad, **sab devices** par same list |
| Order delete | Owner panel se (ek ya saare) |
| Website par notification | Owner panel khula ho to **browser notification** + toast |

---

## Step 1 — CallMeBot activate karo (WhatsApp ke liye, 2 minute)

1. Apne phone mein **+34 621 34 22 27** ko contact mein save karo (naam kuch bhi rakho)
2. Us contact ko WhatsApp par ye message bhejo:
   ```
   I allow callmebot to send me messages
   ```
3. Bot reply karega:
   ```
   API Activated for your phone number. Your APIKEY is 123456
   ```
4. Wo **APIKEY** aur apna **WhatsApp number** (country code ke saath, jaise `919876543210`) mujhe bhej do.

> Agar 2 minute mein reply na aaye to 24 ghante baad dobara try karna hota hai (CallMeBot ka rule).

---

## Step 2 — Netlify par deploy (main karunga, tum sirf login karoge)

Netlify CLI install ho raha hai. Uske baad:

1. Main `netlify login` chalaunga — tumhare browser mein Netlify ka login page khulega
2. Tum **GitHub se login** kar lena (ya email se account bana lena) — free hai
3. Main phir deploy karke environment variables set karunga
4. Live link milega, jaise `https://tiffin-holo.netlify.app`

---

## Step 3 — Environment variables (main set karunga)

Ye Netlify par secret rehte hain, website ke code mein nahi:

| Variable | Value |
|---|---|
| `ADMIN_SALT` | `th$2025$holo` |
| `ADMIN_ID_HASH` | `2a739d60ae10d08c034807b071d32a8370810b67de83d1dc0042a137d3a5829d` |
| `ADMIN_PWD_HASH` | `c7f59563136b44770c17df6ced2c60559abd027919f3dfc7a456e84fc729e725` |
| `TELEGRAM_BOT_TOKEN` | (tumhara bot token — already mil gaya) |
| `TELEGRAM_CHAT_ID` | `1793081892` |
| `CALLMEBOT_PHONE` | Step 1 se (jaise `919876543210`) |
| `CALLMEBOT_APIKEY` | Step 1 se |

---

## Owner login (jaisa tha waisa hi)

- **ID:** `Tifin Holo12`
- **Password:** `sharma12@`

Order History dekhne ke liye page ke bottom-right 🔒 button par click karo.

---

## Kaise test karein

1. Live link apne phone par kholo, ek test order bhejo
2. Turant **Telegram** aur **WhatsApp** par message aana chahiye
3. Apne computer par owner login karo → order history mein wahi order dikhna chahiye

---

## Free plan ki limits (Netlify)

- 100 GB bandwidth/month — tumhari site ke liye kaafi zyada hai
- Functions: 125,000 requests/month
- Blobs (order storage): 1 GB — hazaron orders ke liye kaafi

Sab free hai, credit card nahi chahiye.
