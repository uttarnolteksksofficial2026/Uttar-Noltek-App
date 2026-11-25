
import './style.css';
import { auth, db } from './firebase.js';

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, orderBy, limit, addDoc, serverTimestamp
} from 'firebase/firestore';

const $ = (s) => document.querySelector(s);
let confirmation = null, recaptcha = null, currentUser = null, profile = null;
const app = $('#app');

// আপনার আপলোড করা লোগোর ঠিকানা
const logoUrl = '/logo.png';

// লোগোসহ Header
function shell(content) {
  app.innerHTML = `
    <header>
      <img
        src="${logoUrl}"
        alt="উত্তর নলটেক সমাজ কল্যাণ সংগঠন"
        class="brandmark"
        style="width:55px;height:55px;object-fit:contain;flex-shrink:0;"
      >
      <div>
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
      <button id="lang" class="ghost">EN</button>
    </header>
    <main>${content}</main>
    <footer>মানবতার সেবায় · উত্তর নলটেক, বাঘড়া, শ্রীনগর, মুন্সীগঞ্জ</footer>
  `;

  $('#lang')?.addEventListener('click', () =>
    alert('বাংলা / English interface: English labels will be added in the next build.')
  );
}

function loginView() {
  shell(`
    <section class="hero">
      <span class="eyebrow">COMMUNITY • SERVICE • UNITY</span>
      <h1>একসাথে গড়ি<br>মানবিক সমাজ</h1>
      <p>সদস্য নিবন্ধন, সংগঠনের খবর এবং সমাজকল্যাণমূলক কার্যক্রম এক জায়গায়।</p>
    </section>
    <section class="panel">
      <h2>সদস্য লগইন / নিবন্ধন</h2>
      <label>বাংলাদেশি মোবাইল নম্বর</label>
      <input id="phone" placeholder="01XXXXXXXXX" inputmode="tel">
      <button id="send" class="primary">OTP পাঠান</button>
      <div id="recaptcha-container"></div>
      <div id="otpbox" hidden>
        <label>SMS-এ পাওয়া OTP</label>
        <input id="otp" placeholder="৬ সংখ্যার OTP" inputmode="numeric">
        <button id="verify" class="primary">যাচাই করুন</button>
      </div>
      <p class="hint" id="msg">নম্বরটি +880 ফরম্যাটে যাচাই করা হবে।</p>
    </section>
    <p class="notice">নিবন্ধনের পর অ্যাডমিন অনুমোদন না দেওয়া পর্যন্ত সদস্যপদ Pending থাকবে।</p>
  `);
  $('#send').onclick = sendOtp;
  $('#verify').onclick = verifyOtp;
}

function phoneFormat(v) {
  v = v.replace(/[\s-]/g, '');
  if (v.startsWith('+')) return v;
  if (v.startsWith('880')) return '+' + v;
  if (v.startsWith('0')) return '+88' + v;
  return '+880' + v;
}

async function sendOtp() {
  const p = phoneFormat($('#phone').value);
  if (!/^\+8801\d{9}$/.test(p)) {
    $('#msg').textContent = 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।';
    return;
  }

  $('#send').disabled = true;

  try {
    if (!recaptcha) {
      recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'normal' });
    }

    confirmation = await signInWithPhoneNumber(auth, p, recaptcha);
    $('#otpbox').hidden = false;
    $('#msg').textContent = 'OTP পাঠানো হয়েছে। SMS দেখে কোড লিখুন।';

  } catch (e) {
    $('#msg').textContent = 'OTP পাঠানো যায়নি: ' + e.message;
    recaptcha?.clear();
    recaptcha = null;

  } finally {
    $('#send').disabled = false;
  }
}

async function verifyOtp() {
  if (!confirmation) {
    $('#msg').textContent = 'আগে OTP পাঠান।';
    return;
  }

  try {
    await confirmation.confirm($('#otp').value.trim());
  } catch (e) {
    $('#msg').textContent = 'OTP সঠিক নয় বা মেয়াদ শেষ হয়েছে। আবার চেষ্টা করুন।';
  }
}

async function loadUser(user) {
  currentUser = user;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    profile = {
      phone: user.phoneNumber,
      status: 'pending',
      role: 'member',
      createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    profile = { ...profile };
  } else {
    profile = snap.data();
  }

  if (profile.status === 'pending') {
    pendingView();
    return;
  }

  if (profile.status === 'rejected') {
    shell(`
      <section class="panel">
        <h2>আবেদন অনুমোদিত হয়নি</h2>
        <p>বিস্তারিত জানতে সংগঠনের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।</p>
        <button id="out" class="secondary">লগআউট</button>
      </section>
    `);
    $('#out').onclick = () => signOut(auth);
    return;
  }

  homeView();
}

function pendingView() {
  shell(`
    <section class="panel center">
      <div class="status">আবেদন জমা হয়েছে</div>
      <h2>অ্যাডমিন অনুমোদনের অপেক্ষায়</h2>
      <p>আপনার মোবাইল নম্বর যাচাই হয়েছে। সংগঠনের অ্যাডমিন আবেদন পর্যালোচনা করলে সদস্য সুবিধা চালু হবে।</p>
      <button id="out" class="secondary">লগআউট</button>
    </section>
  `);
  $('#out').onclick = () => signOut(auth);
}

async function homeView() {
  let notices = [];

  try {
    const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'), limit(5));
    const s = await getDocs(q);
    notices = s.docs.map(d => d.data());
  } catch (e) {
    console.log(e);
  }

  shell(`
    <section class="hero compact">
      <span class="eyebrow">WELCOME</span>
      <h1>স্বাগতম</h1>
      <p>উত্তর নলটেক সমাজ কল্যাণ সংগঠনের সদস্য প্ল্যাটফর্মে আপনাকে স্বাগতম।</p>
    </section>

    <div class="tiles">
      <article>
        <b>সদস্য পরিচিতি</b>
        <span>${currentUser.phoneNumber || ''}</span>
      </article>
      <article>
        <b>সদস্য অবস্থা</b>
        <span class="approved">অনুমোদিত</span>
      </article>
    </div>

    <section class="panel">
      <h2>নোটিশ ও ঘোষণা</h2>
      ${
        notices.length
          ? notices.map(n => `
              <div class="noticeitem">
                <b>${escapeHtml(n.title || 'নোটিশ')}</b>
                <p>${escapeHtml(n.body || '')}</p>
              </div>
            `).join('')
          : '<p class="hint">এখনো কোনো নোটিশ প্রকাশিত হয়নি।</p>'
      }
    </section>

    ${
      profile.role === 'admin'
        ? `
          <section class="panel">
            <h2>অ্যাডমিন প্যানেল</h2>
            <p>নতুন সদস্য আবেদন পর্যালোচনা করুন।</p>
            <button id="admin" class="primary">আবেদন দেখুন</button>
            <div id="queue"></div>
            <hr>
            <input id="ntitle" placeholder="নোটিশের শিরোনাম">
            <textarea id="nbody" placeholder="নোটিশের বিবরণ"></textarea>
            <button id="publish" class="secondary">নোটিশ প্রকাশ করুন</button>
          </section>
        `
        : ''
    }

    <button id="out" class="secondary full">লগআউট</button>
  `);

  $('#out').onclick = () => signOut(auth);

  if (profile.role === 'admin') {
    $('#admin').onclick = loadQueue;
    $('#publish').onclick = publishNotice;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

async function loadQueue() {
  const box = $('#queue');
  box.innerHTML = '<p>লোড হচ্ছে…</p>';

  try {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'), limit(50));
    const s = await getDocs(q);

    box.innerHTML = s.empty
      ? '<p class="hint">নতুন আবেদন নেই।</p>'
      : s.docs.map(d => `
          <div class="applicant">
            <span>${escapeHtml(d.data().phone || 'নম্বর নেই')}</span>
            <button data-approve="${d.id}">অনুমোদন</button>
          </div>
        `).join('');

    box.querySelectorAll('[data-approve]').forEach(b => {
      b.onclick = () => approve(b.dataset.approve);
    });

  } catch (e) {
    box.textContent = 'আবেদন লোড করা যায়নি: ' + e.message;
  }
}

async function approve(uid) {
  try {
    await setDoc(doc(db, 'users', uid), { status: 'approved' }, { merge: true });
    await loadQueue();
  } catch (e) {
    alert('অনুমোদন করা যায়নি: ' + e.message);
  }
}

async function publishNotice() {
  const title = $('#ntitle').value.trim();
  const body = $('#nbody').value.trim();

  if (!title || !body) {
    return alert('শিরোনাম ও বিবরণ লিখুন।');
  }

  try {
    await addDoc(collection(db, 'notices'), {
      title,
      body,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('নোটিশ প্রকাশিত হয়েছে।');
    $('#ntitle').value = '';
    $('#nbody').value = '';

  } catch (e) {
    alert('প্রকাশ করা যায়নি: ' + e.message);
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    loadUser(user).catch(e =>
      shell(`<section class="panel"><p>লোড করতে সমস্যা হয়েছে: ${escapeHtml(e.message)}</p></section>`)
    );
  } else {
    loginView();
  }
});
   
