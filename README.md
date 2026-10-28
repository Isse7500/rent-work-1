# Diiwaanka Guryaha iyo Kirada: website dhab ah

Waxaa ku jira: `server.js` (server + amni), `public/index.html` (website-ka), `package.json`.
Xogta waxay ku kaydsan tahay **PostgreSQL**, ma ahan browser-ka. Qof walba wuxuu arkaa oo keliya waxa loo ogolaaday.

## Habka ugu fudud (bilaash, ~20 daqiiqo)

### 1. Database (Neon)
1. Gal https://neon.tech, samee akoon, "Create project".
2. Nuqul ka qaad **Connection string** (waxay u egtahay `postgresql://user:pass@host/db?sslmode=require`). Kani waa `DATABASE_URL`.

### 2. Koodhka geli GitHub
1. Samee akoon https://github.com, "New repository" (Private).
2. Ku shub (Upload files) dhammaan faylasha folderkan (`server.js`, `package.json`, `public/`).

### 3. Server (Render)
1. Gal https://render.com, "New" > "Web Service", ku xiri GitHub repo-gaaga.
2. Build Command: `npm install`  |  Start Command: `npm start`
3. Environment Variables:
   - `DATABASE_URL` = tii Neon
   - `ADMIN_USER` = username-ka admin-ka (tusaale: `admin`)
   - `ADMIN_PASS` = password adag (8+ xaraf)
   - `ADMIN_KEY` = Secret Key-ga admin-ka (qoraal gaar ah, 4+ xaraf)
   - `SESSION_SECRET` = qoraal dheer oo random ah (30+ xaraf)
4. "Deploy". Marka uu dhammaado, Render wuxuu ku siinayaa link sida `https://diiwaan-guryaha.onrender.com`. **Linkaas dadka u dir.**

### 4. Isticmaalka
- Gal adigoo isticmaalaya `ADMIN_USER` / `ADMIN_PASS`.
- Admin-ku wuxuu sameeyaa isticmaalayaasha (xog-haynta degmooyinka) iyo kireystayaasha (username + password).
- Kireystayaashu iyo isticmaalayaashu waxay ka galaan linkiga taleefankooda.

## Tijaabo kombuyuutarkaaga
```
npm install
DATABASE_URL=... ADMIN_USER=admin ADMIN_PASS=passwordkaaga1 SESSION_SECRET=qoraal-dheer-oo-random-ah-123456 npm start
```
Kadib fur http://localhost:3000

## Xusuusin muhiim ah
- Render bilaashka ah wuu "hurdaa" marka 15 daqiiqo la isticmaali waayo; marka koowaad wuu gaabis yahay (~1 daqiiqo). Xogtu way ammaan tahay maxaa yeelay waxay ku jirtaa Neon.
- Si joogto ah u soo deji **Excel** (dashboard-ka) oo kaydi nuqul.
- Password-ka admin-ka beddel adigoo beddelaya `ADMIN_PASS` gudaha Render.
- HTTPS waa automatic Render. Isticmaal passwords adag.
- Koodhkan lama tijaabin database nool; haddii khalad yimaado marka la deploy-gareynayo, ii soo dir fariinta khaladka.

## Link: rentwork.com (domain)
1. **Link degdeg ah:** magaca service-ka Render ku samee `rent-work`; wuxuu noqonayaa `https://rent-work.onrender.com` (bilaash).
2. **Domain u gaar ah:** iibso `rentwork.com` (Namecheap, GoDaddy ama Cloudflare, ~$10-15/sanad). Marka hore hubi inuu bannaan yahay; haddii la qaatay, isku day `rentwork.so`, `rent-work.com` ama kale.
3. Render > service-kaaga > **Settings > Custom Domains > Add** > ku qor `rentwork.com` iyo `www.rentwork.com`. Render wuxuu ku tusayaa DNS records (CNAME/A); ku dar goobta aad domain-ka ka iibsatay (DNS settings). HTTPS waa automatic.

## Login
Isticmaale kasta wuxuu u baahan yahay **Username + Password + Secret Key**. Admin-ka: `ADMIN_USER`, `ADMIN_PASS`, `ADMIN_KEY`. Kireystayaasha iyo xog-hayaasha, admin-ku wuxuu u sameeyaa foomka gudihiisa.
