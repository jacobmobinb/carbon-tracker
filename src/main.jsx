import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**File 5: `src/App.jsx`**
- Copy the **ENTIRE code** from the artifact above (the professional dark theme one)
- Paste it here

**STEP 4: Deploy to Vercel** (5 min)

1. Go to: https://vercel.com
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel
5. Click "Import Project"
6. Select your `carbon-tracker` repository
7. Click "Deploy"
8. Wait 2-3 minutes ⏳

**DONE!** Your app is live at: `carbon-tracker-yourname.vercel.app`

---

## 🌐 **Option 2: Deploy to Netlify (Alternative)**

Very similar to Vercel:

1. Go to: https://netlify.com
2. Sign up with GitHub
3. Click "Add new site" → "Import from Git"
4. Select your GitHub repo
5. Click "Deploy"
6. Live at: `carbon-tracker.netlify.app`

---

## 🔧 **Option 3: Deploy to Your Own Domain**

**If you already own a domain** (like sunengineering.com.au):

### **With Vercel:**
1. After deploying (steps above)
2. Go to your Vercel project → Settings → Domains
3. Add your domain: `carbon.sunengineering.com.au`
4. Follow DNS instructions
5. Done! Accessible at your custom domain

### **DNS Setup:**
Add these records at your domain registrar:
```
Type: CNAME
Name: carbon
Value: cname.vercel-dns.com
