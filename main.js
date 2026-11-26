
import './style.css';
import { auth, db } from './firebase.js';

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  doc, getDoc, setDoc, collection, where,
  getDocs, orderBy, limit, addDoc, serverTimestamp,
  updateDoc, deleteDoc, query
} from 'firebase/firestore';

const $ = s => document.querySelector(s);

let confirmation = null;
let recaptcha = null;
let currentUser = null;
let profile = null;
let editingTermId = null;
let editingConstitutionId = null;
let constitutionStatus = 'draft';

const app = $('#app');
const LOGO_URL = '/logo.png';

const contact = {
  phone: '+8801602267423',
  email: 'uttarnoltek.sks.official2026@gmail.com',
  facebook: 'https://www.facebook.com/share/151EhhMPwC7/'
};

/* COMMON HELPERS */

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function logoHTML() {
  return `<img class="brandmark" src="${LOGO_URL}" alt="সংগঠনের লোগো">`;
}

function formatPhone(value) {
  let p = value.replace(/[\s-]/g, '');

  if (/^01\d{9}$/.test(p)) return '+88' + p;
  if (/^05\d{8}$/.test(p)) return '+966' + p.slice(1);
  if (/^5\d{8}$/.test(p)) return '+966' + p;

  if (/^\+8801\d{9}$/.test(p) || /^\+9665\d{8}$/.test(p)) {
    return p;
  }

  throw new Error('সঠিক বাংলাদেশি অথবা সৌদি মোবাইল নম্বর দিন।');
}

function footer() {
  return `<footer>মানবতার সেবায় · উত্তর নলটেক, বাঘড়া, শ্রীনগর, মুন্সীগঞ্জ</footer>`;
}

function money(amount) {
  return '৳ ' + Number(amount || 0).toLocaleString('bn-BD');
}

function sortByOrder(items) {
  return [...items].sort((a, b) =>
    Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999)
  );
}

async function getList(name, filters = []) {
  let q = collection(db, name);

  if (filters.length) {
    q = query(q, ...filters);
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* HEADER AND MENU */

function baseHeader() {
  return `
    <header class="app-header">
      <button class="menu-toggle" id="menuToggle"
        type="button" aria-label="মেনু খুলুন"
        aria-expanded="false">☰</button>
      ${logoHTML()}
      <div class="brand-title">
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
      <button class="ghost" id="logout" type="button">লগআউট</button>
    </header>`;
}

function menuDrawer(items) {
  return `
    <div class="drawer-backdrop" id="drawerBackdrop"></div>
    <aside class="side-drawer" id="sideDrawer">
      <div class="drawer-heading">
        <span>☰ মেনু</span>
        <button id="closeDrawer" type="button" aria-label="বন্ধ করুন">✕</button>
      </div>

      <div class="drawer-brand">
        ${logoHTML()}
        <b>উত্তর নলটেক</b>
        <strong>সমাজ কল্যাণ সংগঠন</strong>
        <small>একতাই শক্তি · Unity is Strength</small>
        <span class="drawer-decoration">✦ মানবতার সেবায় ✦</span>
      </div>

      <div class="drawer-links">
        ${items.map(item => `
          <button class="drawer-link" type="button"
            data-page-link="${escapeHTML(item.id)}">
            <span class="drawer-icon">${item.icon}</span>
            <span>${escapeHTML(item.label)}</span>
            <span class="drawer-arrow">›</span>
          </button>
        `).join('')}
      </div>

      <div class="drawer-footer">মানবতার সেবায় · উত্তর নলটেক</div>
    </aside>`;
}

function bindLogout() {
  const button = $('#logout');
  if (button) button.onclick = () => signOut(auth);
}

function contactHTML() {
  return `
    <section class="panel">
      <h2 class="heading-blue">যোগাযোগ</h2>
      <p>মোবাইল: <a href="tel:${contact.phone}">${contact.phone}</a></p>
      <p>ইমেইল: <a href="mailto:${contact.email}">${contact.email}</a></p>
      <p><a href="${contact.facebook}" target="_blank" rel="noopener">Facebook পেজ</a></p>
    </section>`;
}

/* LOGIN */

function loginView() {
  app.innerHTML = `
    <header class="app-header">
      ${logoHTML()}
      <div class="brand-title">
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
    </header>

    <main class="app-main">
      <section class="hero">
        <div class="eyebrow">WELCOME</div>
        <h1>স্বাগতম</h1>
        <p>উত্তর নলটেক সমাজ কল্যাণ সংগঠনের সদস্য প্ল্যাটফর্মে আপনাকে স্বাগতম।</p>
      </section>

      <section class="panel">
        <h2 class="heading-blue">সদস্য লগইন</h2>
        <p class="hint">মোবাইল নম্বরে OTP পাঠিয়ে লগইন করুন।</p>

        <label for="phone">মোবাইল নম্বর</label>
        <input id="phone" type="tel" inputmode="tel"
          autocomplete="tel"
          placeholder="01XXXXXXXXX অথবা 05XXXXXXXX">

        <div id="recaptcha-container"></div>

        <button class="primary" id="sendOtp" type="button">
          OTP পাঠান
        </button>

        <div id="otpArea" hidden>
          <label for="otp">OTP কোড</label>
          <input id="otp" type="text" inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6" placeholder="৬ সংখ্যার OTP">

          <button class="primary" id="verifyOtp" type="button">
            যাচাই করে লগইন করুন
          </button>

          <button class="secondary" id="resendOtp" type="button">
            আবার OTP পাঠান
          </button>
        </div>

        <p class="hint" id="message" role="status" aria-live="polite"></p>
      </section>

      ${contactHTML()}
    </main>
    ${footer()}`;

  $('#sendOtp').onclick = sendOtp;
  $('#verifyOtp').onclick = verifyOtp;
  $('#resendOtp').onclick = sendOtp;
}

function resetRecaptcha() {
  if (recaptcha) {
    try {
      recaptcha.clear();
    } catch (error) {
      console.warn('reCAPTCHA reset:', error);
    }
  }

  recaptcha = null;

  const container = $('#recaptcha-container');
  if (container) container.innerHTML = '';
}

async function sendOtp() {
  const message = $('#message');
  const button = $('#sendOtp');

  try {
    const phone = formatPhone($('#phone').value.trim());

    button.disabled = true;
    $('#resendOtp').disabled = true;
    message.textContent = 'নিরাপত্তা যাচাই করা হচ্ছে...';

    resetRecaptcha();

    recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        message.textContent = 'নিরাপত্তা যাচাই সম্পন্ন।';
      },
      'expired-callback': () => {
        message.textContent = 'নিরাপত্তা যাচাইয়ের সময় শেষ হয়েছে। আবার চেষ্টা করুন।';
        resetRecaptcha();
      }
    });

    await recaptcha.render();

    message.textContent = 'আপনার নম্বরে OTP পাঠানো হচ্ছে...';

    confirmation = await signInWithPhoneNumber(auth, phone, recaptcha);

    $('#otpArea').hidden = false;
    $('#otp').value = '';
    $('#otp').focus();

    message.textContent = 'OTP পাঠানো হয়েছে। SMS থেকে ৬ সংখ্যার কোড লিখুন।';

  } catch (error) {
    console.error('OTP SEND ERROR:', error);

    const errors = {
      'auth/invalid-phone-number': 'মোবাইল নম্বর সঠিক নয়।',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।',
      'auth/quota-exceeded': 'Firebase-এর SMS সীমা শেষ হয়েছে।',
      'auth/captcha-check-failed': 'নিরাপত্তা যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।',
      'auth/unauthorized-domain': 'এই ওয়েবসাইট Firebase-এ অনুমোদিত নয়।',
      'auth/operation-not-allowed': 'Firebase-এ Phone Authentication চালু নেই।',
      'auth/network-request-failed': 'ইন্টারনেট সংযোগ পরীক্ষা করুন।',
      'auth/billing-not-enabled': 'Firebase-এর প্রয়োজনীয় বিলিং সেটিংস চালু নেই।'
    };

    message.textContent =
      errors[error.code] ||
      'OTP পাঠানো যায়নি: ' + (error.message || 'অজানা সমস্যা');

    confirmation = null;
    resetRecaptcha();

  } finally {
    button.disabled = false;
    $('#resendOtp').disabled = false;
  }
}

async function verifyOtp() {
  const button = $('#verifyOtp');
  const message = $('#message');

  try {
    const code = $('#otp').value.trim();

    if (!confirmation) {
      throw new Error('আগে OTP পাঠান।');
    }

    if (!/^\d{6}$/.test(code)) {
      throw new Error('সঠিক ৬ সংখ্যার OTP লিখুন।');
    }

    button.disabled = true;
    message.textContent = 'OTP যাচাই করা হচ্ছে...';

    await confirmation.confirm(code);

    message.textContent = 'লগইন সফল হয়েছে।';

  } catch (error) {
    console.error('OTP VERIFY ERROR:', error);

    const errors = {
      'auth/invalid-verification-code': 'OTP কোড ভুল হয়েছে। আবার লিখুন।',
      'auth/code-expired': 'OTP-এর মেয়াদ শেষ হয়েছে। নতুন OTP নিন।',
      'auth/session-expired': 'লগইন সেশন শেষ হয়েছে। নতুন OTP নিন।',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।'
    };

    message.textContent =
      errors[error.code] || error.message || 'OTP যাচাই করা যায়নি।';

  } finally {
    button.disabled = false;
  }
}

/* AUTH */

async function loadUser(user) {
  currentUser = user;

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      phone: user.phoneNumber,
      status: 'pending',
      role: 'member',
      createdAt: serverTimestamp()
    });

    profile = {
      phone: user.phoneNumber,
      status: 'pending',
      role: 'member'
    };
  } else {
    profile = snap.data();
  }

  if (profile.status === 'pending') return pendingView();
  if (profile.status === 'rejected') return rejectedView();
  if (profile.status !== 'approved') return pendingView();

  if (profile.role === 'admin') return adminView();
  return memberView();
}

function pendingView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="panel center">
        <h2 class="heading-orange">আবেদন জমা হয়েছে</h2>
        <p>আপনার সদস্য আবেদন অ্যাডমিনের অনুমোদনের অপেক্ষায় রয়েছে।</p>
        <span class="status">অনুমোদনের অপেক্ষায়</span>
      </section>
    </main>
    ${footer()}`;

  bindLogout();
}

function rejectedView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="panel center">
        <h2 class="heading-red">আবেদন অনুমোদিত হয়নি</h2>
        <p>বিস্তারিত জানতে সংগঠনের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।</p>
      </section>
      ${contactHTML()}
    </main>
    ${footer()}`;

  bindLogout();
}

/* NAVIGATION */

function setupNavigation() {
  const navButtons = document.querySelectorAll('[data-page-link]');

  function closeMenu() {
    $('#sideDrawer')?.classList.remove('open');
    $('#drawerBackdrop')?.classList.remove('show');
    $('#menuToggle')?.setAttribute('aria-expanded', 'false');
  }

  function openPage(page) {
    document.querySelectorAll('[data-page]').forEach(section => {
      section.hidden = section.dataset.page !== page;
    });

    navButtons.forEach(button => {
      button.classList.toggle('active', button.dataset.pageLink === page);
    });

    closeMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navButtons.forEach(button => {
    button.onclick = () => openPage(button.dataset.pageLink);
  });

  const toggle = $('#menuToggle');
  const drawer = $('#sideDrawer');
  const backdrop = $('#drawerBackdrop');
  const close = $('#closeDrawer');

  if (toggle) {
    toggle.onclick = () => {
      const isOpen = drawer?.classList.toggle('open');
      backdrop?.classList.toggle('show', Boolean(isOpen));
      toggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
    };
  }

  if (close) close.onclick = closeMenu;
  if (backdrop) backdrop.onclick = closeMenu;

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });

  const first = document.querySelector('.bottom-nav [data-page-link]');
  if (first) openPage(first.dataset.pageLink);
}

function bottomNavigation(items) {
  return `<nav class="bottom-nav">
    ${items.map((item, index) => `
      <button class="nav-item ${index === 0 ? 'active' : ''}"
        data-page-link="${escapeHTML(item.id)}" type="button">
        <span class="nav-icon">${item.icon}</span>
        <span>${escapeHTML(item.label)}</span>
      </button>`).join('')}
  </nav>`;
}

/* DEFAULT RULES */

function defaultRules() {
  return [
    {
      title: '১. সদস্যপদ',
      body: 'সংগঠনের উদ্দেশ্য ও আদর্শের প্রতি শ্রদ্ধাশীল হতে হবে। সঠিক তথ্য দিয়ে সদস্যপদের আবেদন করতে হবে। অ্যাডমিনের অনুমোদনের পর সদস্যপদ কার্যকর হবে।'
    },
    {
      title: '২. মাসিক চাঁদা',
      body: 'প্রত্যেক সদস্যকে সাধারণ সভায় নির্ধারিত মাসিক চাঁদা প্রদান করতে হবে। জমা দেওয়ার পর ডিজিটাল রশিদ সংগ্রহ করতে হবে।'
    },
    {
      title: '৩. আর্থিক স্বচ্ছতা',
      body: 'সংগঠনের সব আয় ও ব্যয়ের হিসাব সংরক্ষণ করতে হবে। সংগঠনের অর্থ ব্যক্তিগত কাজে ব্যবহার করা যাবে না।'
    },
    {
      title: '৪. সদস্যদের দায়িত্ব',
      body: 'সংগঠনের সভা ও সামাজিক কার্যক্রমে অংশগ্রহণ করতে হবে। অন্য সদস্যদের সঙ্গে সম্মানজনক আচরণ করতে হবে।'
    },
    {
      title: '৫. সভা ও সিদ্ধান্ত',
      body: 'সংগঠনের সভায় গৃহীত সিদ্ধান্ত মেনে চলতে হবে। গুরুত্বপূর্ণ সিদ্ধান্ত অনুমোদিত কর্তৃপক্ষের মাধ্যমে গ্রহণ করতে হবে।'
    },
    {
      title: '৬. শৃঙ্খলা',
      body: 'প্রতারণা, অসদাচরণ ও আর্থিক অনিয়ম গ্রহণযোগ্য হবে না। অভিযোগের ক্ষেত্রে আত্মপক্ষ সমর্থনের সুযোগ দিতে হবে।'
    },
    {
      title: '৭. সদস্যপদ স্থগিত বা বাতিল',
      body: 'গুরুতর নিয়মভঙ্গের ক্ষেত্রে তদন্ত ও আত্মপক্ষ সমর্থনের সুযোগ দেওয়ার পর কর্তৃপক্ষ ব্যবস্থা নিতে পারবে।'
    },
    {
      title: '৮. চূড়ান্ত বিধান',
      body: 'সংগঠনের কল্যাণে প্রয়োজন হলে সাধারণ সভার অনুমোদনে নিয়মাবলি সংশোধন করা যাবে।'
    }
  ];
}

function renderRules(rules) {
  if (!rules.length) rules = defaultRules();

  return rules.map(r => `
    <article class="noticeitem rule-card">
      <h3 class="rule-title">${escapeHTML(r.title)}</h3>
      <p>${escapeHTML(r.body)}</p>
    </article>`).join('');
}

async function loadMemberRules() {
  const box = $('#memberRules');
  if (!box) return;

  try {
    box.innerHTML = renderRules(await getList('rules'));
  } catch (error) {
    console.error(error);
    box.innerHTML = renderRules(defaultRules());
  }
}

/* DEFAULT CONSTITUTION */

function defaultConstitution() {
  return [
    {
      title: 'প্রথম অধ্যায় — নাম, পরিচয় ও কার্যালয়',
      body: `ধারা ১: সংগঠনের নাম হবে “উত্তর নলটেক সমাজ কল্যাণ সংগঠন”।
ধারা ২: সংগঠনটি অরাজনৈতিক, অলাভজনক, স্বেচ্ছাসেবী ও সমাজকল্যাণমূলক প্রতিষ্ঠান হিসেবে পরিচালিত হবে।
ধারা ৩: সংগঠনের প্রধান কার্যক্ষেত্র উত্তর নলটেক, বাঘড়া, শ্রীনগর, মুন্সীগঞ্জ।
ধারা ৪: সংগঠনের কার্যালয়ের ঠিকানা সাধারণ সভার সিদ্ধান্ত অনুযায়ী নির্ধারিত ও পরিবর্তিত হতে পারবে।
ধারা ৫: প্রযোজ্য হলে নিবন্ধন নম্বর ও নিবন্ধনের তারিখ: [প্রযোজ্য ক্ষেত্রে পূরণ করতে হবে]।`
    },
    {
      title: 'দ্বিতীয় অধ্যায় — লক্ষ্য ও উদ্দেশ্য',
      body: `ধারা ১: এলাকার দরিদ্র, অসহায়, অসুস্থ ও বিপদগ্রস্ত মানুষের পাশে দাঁড়ানো।
ধারা ২: দরিদ্র ও মেধাবী শিক্ষার্থীদের শিক্ষা সহায়তা প্রদান।
ধারা ৩: অসুস্থ ও অসচ্ছল মানুষের চিকিৎসা সহায়তায় উদ্যোগ গ্রহণ।
ধারা ৪: বন্যা, অগ্নিকাণ্ড, প্রাকৃতিক দুর্যোগ ও জরুরি পরিস্থিতিতে ত্রাণ সহায়তা প্রদান।
ধারা ৫: সামাজিক সম্প্রীতি, ঐক্য, মানবিকতা ও ভ্রাতৃত্ববোধ প্রতিষ্ঠা।
ধারা ৬: পরিবেশ সংরক্ষণ, পরিচ্ছন্নতা ও জনসচেতনতামূলক কার্যক্রম পরিচালনা।
ধারা ৭: এলাকার সামগ্রিক উন্নয়নে বৈধ ও জনকল্যাণমূলক উদ্যোগ গ্রহণ।`
    },
    {
      title: 'তৃতীয় অধ্যায় — সদস্যপদ',
      body: `ধারা ১: সংগঠনের লক্ষ্য ও উদ্দেশ্যের প্রতি শ্রদ্ধাশীল ব্যক্তি সদস্য হওয়ার আবেদন করতে পারবেন।
ধারা ২: আবেদনকারীকে নির্ধারিত আবেদনপত্রে সঠিক তথ্য প্রদান করতে হবে।
ধারা ৩: নির্ধারিত যাচাই ও অনুমোদনের পর সদস্যপদ কার্যকর হবে।
ধারা ৪: সদস্যের ধরন, যোগ্যতা, চাঁদা ও অন্যান্য শর্ত সাধারণ সভায় নির্ধারিত হবে।
ধারা ৫: সদস্যপদ স্বেচ্ছায় লিখিত আবেদনের মাধ্যমে ত্যাগ করা যাবে।
ধারা ৬: সদস্যপদের তথ্য সংগঠনের নথিতে সংরক্ষণ করতে হবে।`
    },
    {
      title: 'চতুর্থ অধ্যায় — সদস্যদের অধিকার',
      body: `ধারা ১: প্রত্যেক অনুমোদিত সদস্য সংগঠনের কার্যক্রমে অংশগ্রহণ করতে পারবেন।
ধারা ২: সভায় মতামত, প্রস্তাব ও গঠনমূলক সমালোচনা উপস্থাপন করতে পারবেন।
ধারা ৩: অনুমোদিত পদ্ধতিতে সংগঠনের হিসাব ও কার্যক্রম সম্পর্কে তথ্য জানতে পারবেন।
ধারা ৪: গঠনতন্ত্র ও নিয়ম অনুযায়ী নির্বাচনে অংশগ্রহণ ও ভোটাধিকার প্রয়োগ করতে পারবেন।
ধারা ৫: অভিযোগ বা আপিল উপস্থাপনের ন্যায্য সুযোগ পাবেন।`
    },
    {
      title: 'পঞ্চম অধ্যায় — সদস্যদের দায়িত্ব ও আচরণ',
      body: `ধারা ১: সংগঠনের গঠনতন্ত্র, নিয়ম ও বৈধ সিদ্ধান্ত মেনে চলতে হবে।
ধারা ২: সংগঠনের সুনাম, সম্পদ ও গোপনীয়তা রক্ষা করতে হবে।
ধারা ৩: অন্য সদস্য ও উপকারভোগীদের সঙ্গে সম্মানজনক আচরণ করতে হবে।
ধারা ৪: সামর্থ্য ও নির্ধারিত নিয়ম অনুযায়ী চাঁদা প্রদান করতে হবে।
ধারা ৫: সংগঠনের নামে ব্যক্তিগত সুবিধা গ্রহণ, প্রতারণা বা বিভ্রান্তিকর প্রচার করা যাবে না।
ধারা ৬: ধর্ম, বর্ণ, লিঙ্গ, আর্থিক অবস্থা বা ব্যক্তিগত পরিচয়ের ভিত্তিতে বৈষম্য করা যাবে না।`
    },
    {
      title: 'ষষ্ঠ অধ্যায় — সাধারণ পরিষদ',
      body: `ধারা ১: সংগঠনের অনুমোদিত সকল সদস্য নিয়ে সাধারণ পরিষদ গঠিত হবে।
ধারা ২: সাধারণ পরিষদ সংগঠনের সর্বোচ্চ নীতিনির্ধারণী সভা হিসেবে কাজ করবে।
ধারা ৩: গঠনতন্ত্র অনুমোদন, সংশোধন, কমিটি নির্বাচন, বার্ষিক প্রতিবেদন ও গুরুত্বপূর্ণ নীতিগত সিদ্ধান্ত সাধারণ পরিষদ গ্রহণ করবে।
ধারা ৪: সাধারণ সভার সময়, নোটিশ, উপস্থিতি ও কোরামের নিয়ম সভায় অনুমোদিত হবে।
ধারা ৫: সভার সিদ্ধান্ত ও কার্যবিবরণী লিখিতভাবে সংরক্ষণ করতে হবে।`
    },
    {
      title: 'সপ্তম অধ্যায় — কার্যনির্বাহী কমিটি',
      body: `ধারা ১: সংগঠনের দৈনন্দিন কার্যক্রম পরিচালনার জন্য কার্যনির্বাহী কমিটি থাকবে।
ধারা ২: কমিটিতে সভাপতি, সহ-সভাপতি, সাধারণ সম্পাদক, যুগ্ম সম্পাদক, সাংগঠনিক সম্পাদক, অর্থ সম্পাদক এবং প্রয়োজনীয় অন্যান্য পদ থাকতে পারবে।
ধারা ৩: কমিটির সুনির্দিষ্ট পদসংখ্যা, সদস্যসংখ্যা ও দায়িত্ব সাধারণ সভায় অনুমোদিত হবে।
ধারা ৪: কমিটির মেয়াদ সাধারণ সভায় নির্ধারিত হবে এবং অনুমোদিত কার্যবিবরণীতে লিপিবদ্ধ থাকবে।
ধারা ৫: কমিটি সাধারণ পরিষদের কাছে জবাবদিহি করবে।`
    },
    {
      title: 'অষ্টম অধ্যায় — পদাধিকারীদের দায়িত্ব',
      body: `ধারা ১: সভাপতি সংগঠনের সার্বিক নেতৃত্ব দেবেন এবং সভায় সভাপতিত্ব করবেন।
ধারা ২: সহ-সভাপতি সভাপতিকে সহযোগিতা করবেন এবং অনুপস্থিতিতে অনুমোদিতভাবে দায়িত্ব পালন করবেন।
ধারা ৩: সাধারণ সম্পাদক প্রশাসনিক কাজ, সভা আহ্বান ও সিদ্ধান্ত বাস্তবায়ন সমন্বয় করবেন।
ধারা ৪: যুগ্ম সম্পাদক সাধারণ সম্পাদককে সহযোগিতা করবেন।
ধারা ৫: সাংগঠনিক সম্পাদক সদস্য ও সাংগঠনিক কার্যক্রম সমন্বয় করবেন।
ধারা ৬: অর্থ সম্পাদক আয়-ব্যয়ের হিসাব, রসিদ ও আর্থিক নথি সংরক্ষণ করবেন।
ধারা ৭: অন্যান্য পদাধিকারী কমিটির সিদ্ধান্ত অনুযায়ী দায়িত্ব পালন করবেন।`
    },
    {
      title: 'নবম অধ্যায় — সভা, কোরাম ও সিদ্ধান্ত',
      body: `ধারা ১: প্রয়োজন অনুযায়ী কার্যনির্বাহী কমিটির সভা অনুষ্ঠিত হবে।
ধারা ২: বছরে অন্তত একবার সাধারণ সভা আয়োজনের উদ্যোগ নিতে হবে।
ধারা ৩: সভার তারিখ, সময়, স্থান ও আলোচ্যসূচি সদস্যদের যথাসময়ে জানাতে হবে।
ধারা ৪: সভার কোরাম সাধারণ সভায় অনুমোদিত নিয়ম অনুযায়ী নির্ধারিত হবে।
ধারা ৫: সিদ্ধান্ত গ্রহণে প্রথমে ঐকমত্যের চেষ্টা করতে হবে; প্রয়োজনে উপস্থিত ভোটাধিকারপ্রাপ্ত সদস্যদের সংখ্যাগরিষ্ঠ মত গ্রহণ করা হবে।
ধারা ৬: গুরুত্বপূর্ণ সিদ্ধান্ত কার্যবিবরণীতে লিখে রাখতে হবে।`
    },
    {
      title: 'দশম অধ্যায় — অর্থ, তহবিল ও অনুদান',
      body: `ধারা ১: সদস্য চাঁদা, স্বেচ্ছা অনুদান, বৈধ অনুদান ও আইনসম্মত অন্যান্য উৎস থেকে তহবিল গঠিত হবে।
ধারা ২: সকল অর্থ সংগঠনের অনুমোদিত জনকল্যাণমূলক কাজে ব্যয় করতে হবে।
ধারা ৩: কোনো সদস্য বা কর্মকর্তা সংগঠনের অর্থ ব্যক্তিগতভাবে আত্মসাৎ বা ব্যক্তিগত কাজে ব্যবহার করতে পারবেন না।
ধারা ৪: প্রতিটি আয় ও ব্যয়ের রসিদ, ভাউচার বা উপযুক্ত প্রমাণ সংরক্ষণ করতে হবে।
ধারা ৫: অর্থ ব্যয়ের ক্ষেত্রে অনুমোদিত সিদ্ধান্ত ও আর্থিক নিয়ন্ত্রণ অনুসরণ করতে হবে।
ধারা ৬: দাতার নির্দিষ্ট উদ্দেশ্যে দেওয়া অনুদান সেই উদ্দেশ্যেই ব্যবহার করতে হবে।`
    },
    {
      title: 'একাদশ অধ্যায় — হিসাব, নিরীক্ষা ও স্বচ্ছতা',
      body: `ধারা ১: সংগঠনের সকল আর্থিক লেনদেন নির্ভুলভাবে লিখিত বা ডিজিটাল খাতায় সংরক্ষণ করতে হবে।
ধারা ২: অর্থ সম্পাদক নিয়মিত আয়-ব্যয়ের বিবরণ প্রস্তুত করবেন।
ধারা ৩: সাধারণ সভায় নির্ধারিত সময়ে আর্থিক প্রতিবেদন উপস্থাপন করতে হবে।
ধারা ৪: প্রয়োজনে নিরপেক্ষ ব্যক্তি বা নিরীক্ষকের মাধ্যমে হিসাব পরীক্ষা করানো যাবে।
ধারা ৫: আর্থিক অনিয়মের অভিযোগ পাওয়া গেলে যথাযথ তদন্ত করতে হবে।
ধারা ৬: সদস্যদের কাছে আর্থিক কার্যক্রমের স্বচ্ছতা বজায় রাখতে হবে।`
    },
    {
      title: 'দ্বাদশ অধ্যায় — নির্বাচন ও শূন্য পদ পূরণ',
      body: `ধারা ১: কার্যনির্বাহী কমিটি গঠনের পদ্ধতি সাধারণ পরিষদ নির্ধারণ করবে।
ধারা ২: নির্বাচন স্বচ্ছ, নিরপেক্ষ ও গ্রহণযোগ্য পদ্ধতিতে সম্পন্ন করতে হবে।
ধারা ৩: নির্বাচনের সময়সূচি, ভোটাধিকার ও প্রার্থী হওয়ার যোগ্যতা সাধারণ সভায় অনুমোদিত হবে।
ধারা ৪: কোনো পদ শূন্য হলে কমিটির প্রস্তাব ও অনুমোদিত নিয়ম অনুযায়ী সাময়িক দায়িত্ব দেওয়া যাবে।
ধারা ৫: নতুন কমিটির কাছে পূর্ববর্তী কমিটির হিসাব, নথি, সম্পদ ও দায়িত্ব বুঝিয়ে দিতে হবে।`
    },
    {
      title: 'ত্রয়োদশ অধ্যায় — শৃঙ্খলা, অভিযোগ ও আপিল',
      body: `ধারা ১: সংগঠনের অর্থ আত্মসাৎ, প্রতারণা, গুরুতর অসদাচরণ বা সংগঠনের ক্ষতিসাধন শৃঙ্খলাভঙ্গ হিসেবে বিবেচিত হবে।
ধারা ২: অভিযোগ লিখিতভাবে কর্তৃপক্ষের কাছে জমা দিতে হবে।
ধারা ৩: অভিযোগ নিরপেক্ষভাবে তদন্ত করতে হবে।
ধারা ৪: অভিযুক্ত সদস্যকে অভিযোগ জানানো ও আত্মপক্ষ সমর্থনের যথাযথ সুযোগ দিতে হবে।
ধারা ৫: অভিযোগ প্রমাণিত হলে সতর্কতা, সাময়িক স্থগিতাদেশ বা সদস্যপদ বাতিলের মতো ব্যবস্থা নেওয়া যাবে।
ধারা ৬: সিদ্ধান্তের বিরুদ্ধে সাধারণ পরিষদে আপিলের সুযোগ থাকবে।`
    },
    {
      title: 'চতুর্দশ অধ্যায় — গঠনতন্ত্র সংশোধন',
      body: `ধারা ১: সংগঠনের প্রয়োজনে গঠনতন্ত্র সংশোধনের প্রস্তাব করা যাবে।
ধারা ২: সংশোধনী প্রস্তাবের কারণ ও প্রস্তাবিত পরিবর্তন সদস্যদের জানাতে হবে।
ধারা ৩: সাধারণ সভায় অনুমোদিত পদ্ধতি ও প্রয়োজনীয় সংখ্যাগরিষ্ঠতার ভিত্তিতে সংশোধনী গৃহীত হবে।
ধারা ৪: অনুমোদিত সংশোধনীর তারিখ ও বিবরণ সংরক্ষণ করতে হবে।
ধারা ৫: প্রচলিত আইন বা প্রযোজ্য নিবন্ধন শর্তের সঙ্গে সামঞ্জস্য বজায় রাখতে হবে।`
    },
    {
      title: 'পঞ্চদশ অধ্যায় — সংগঠন বিলুপ্তি ও সম্পদ',
      body: `ধারা ১: সংগঠন বিলুপ্তির প্রস্তাব সাধারণ পরিষদের বিশেষ সভায় উত্থাপন করতে হবে।
ধারা ২: বিলুপ্তির সিদ্ধান্ত অনুমোদিত পদ্ধতি ও প্রযোজ্য আইন অনুসারে গ্রহণ করতে হবে।
ধারা ৩: বিলুপ্তির আগে সকল দায়-দেনা ও বৈধ পাওনা নিষ্পত্তি করতে হবে।
ধারা ৪: অবশিষ্ট সম্পদ কোনো সদস্যের মধ্যে ব্যক্তিগতভাবে বণ্টন করা যাবে না।
ধারা ৫: অবশিষ্ট সম্পদ আইনসম্মতভাবে অনুরূপ অলাভজনক জনকল্যাণমূলক কাজে হস্তান্তরের সিদ্ধান্ত নিতে হবে।`
    },
    {
      title: 'ষোড়শ অধ্যায় — অন্তর্বর্তী ও চূড়ান্ত বিধান',
      body: `ধারা ১: এই গঠনতন্ত্রের ব্যাখ্যা নিয়ে মতভেদ হলে সাধারণ পরিষদে আলোচনা করে সিদ্ধান্ত নিতে হবে।
ধারা ২: গঠনতন্ত্রের কোনো ধারা দেশের প্রচলিত আইনের সঙ্গে সাংঘর্ষিক হলে প্রচলিত আইন প্রাধান্য পাবে।
ধারা ৩: এই গঠনতন্ত্রের কার্যকারিতা সাধারণ সভায় অনুমোদনের তারিখ থেকে শুরু হবে।
ধারা ৪: অনুমোদনের তারিখ: [সাধারণ সভায় পূরণ করতে হবে]।
ধারা ৫: এই নথিটি বর্তমানে একটি খসড়া; সাধারণ পরিষদের আলোচনা ও অনুমোদনের আগে একে চূড়ান্ত বা আইনগতভাবে নিবন্ধিত গঠনতন্ত্র হিসেবে গণ্য করা যাবে না।`
    }
  ];
}

/* CONSTITUTION STATUS */

async function loadConstitutionStatus() {
  const snap = await getDoc(doc(db, 'constitution', '_settings'));

  constitutionStatus = snap.exists() &&
    snap.data().status === 'approved'
      ? 'approved'
      : 'draft';

  return constitutionStatus;
}

async function saveConstitutionStatus() {
  try {
    const status = $('#constitutionStatus').value;

    await setDoc(doc(db, 'constitution', '_settings'), {
      status: status === 'approved' ? 'approved' : 'draft',
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    }, { merge: true });

    constitutionStatus = status === 'approved' ? 'approved' : 'draft';

    alert('গঠনতন্ত্রের অনুমোদনের অবস্থা সংরক্ষণ হয়েছে।');
    await refreshAdmin();

  } catch (error) {
    console.error(error);
    alert('অবস্থা সংরক্ষণ করা যায়নি: ' + error.message);
  }
}

function renderConstitution(items) {
  const list = sortByOrder(
    items.length ? items : defaultConstitution()
  );

  const approved = constitutionStatus === 'approved';

  return `
    <div class="constitution-cover">
      <div class="constitution-symbol">📖</div>
      <h2>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</h2>
      <h3>গঠনতন্ত্র</h3>
      <p>একতাই শক্তি</p>
      <span class="constitution-status ${approved ? 'approved' : 'draft'}">
        ${approved ? 'সাধারণ সভায় অনুমোদিত' : 'অনুমোদনের অপেক্ষায়'}
      </span>
    </div>

    <div class="noticeitem">
      <b>গুরুত্বপূর্ণ ঘোষণা</b>
      <p>${approved
        ? 'এই গঠনতন্ত্র সংগঠনের সাধারণ সভায় অনুমোদিত হিসেবে চিহ্নিত। এটি সরকারি নিবন্ধনের প্রমাণ নয়।'
        : 'এটি সংগঠনের গঠনতন্ত্রের খসড়া। সাধারণ সভার আলোচনা ও অনুমোদনের আগে চূড়ান্ত নয়।'
      }</p>
    </div>

    ${list.map(item => `
      <article class="noticeitem rule-card">
        <h3 class="rule-title">${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.body)}</p>
      </article>
    `).join('')}`;
}

async function loadMemberConstitution() {
  const box = $('#memberConstitution');
  if (!box) return;

  try {
    const [allItems] = await Promise.all([
      getList('constitution'),
      loadConstitutionStatus()
    ]);

    const items = allItems.filter(x => x.id !== '_settings');
    box.innerHTML = renderConstitution(items);

  } catch (error) {
    console.error(error);
    box.innerHTML = renderConstitution(defaultConstitution());
  }
}

/* RECEIPTS */

function receiptNumber(payment) {
  return payment.receiptNo ||
    ('UNSKS-' + payment.id.slice(-10).toUpperCase());
}

function receiptDate(payment) {
  if (payment.createdAt?.toDate) {
    return payment.createdAt.toDate().toLocaleDateString('bn-BD');
  }

  return 'তারিখ সংরক্ষিত নেই';
}

function openReceipt(payment) {
  const number = receiptNumber(payment);

  const memberName = payment.memberName ||
    payment.memberPhone ||
    'নাম সংরক্ষিত নেই';

  const memberId = payment.memberId ||
    (payment.memberUid
      ? payment.memberUid.slice(0, 10).toUpperCase()
      : 'সংরক্ষিত নেই');

  const receiptWindow = window.open('', '_blank');

  if (!receiptWindow) {
    alert('রশিদ খুলতে সমস্যা হয়েছে। ব্রাউজারে পপ-আপ অনুমতি দিন।');
    return;
  }

  const html = `
    <!doctype html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>ডিজিটাল রশিদ ${escapeHTML(number)}</title>
      <style>
        body{font-family:Arial,sans-serif;background:#f2f6f4;padding:20px;color:#18352d}
        .receipt{max-width:520px;margin:20px auto;background:white;padding:28px;border:2px solid #16805d;border-radius:16px}
        .logo{width:90px;height:90px;object-fit:contain;display:block;margin:auto}
        h1{text-align:center;color:#087653;font-size:22px}
        h2{text-align:center;color:#d13d35}
        .email{text-align:center;font-size:13px}
        .line{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #ddd}
        .amount{font-size:25px;font-weight:bold;color:#087653;text-align:center;padding:20px}
        .paid{text-align:center;color:#087653;font-weight:bold;border:1px solid #087653;padding:9px;border-radius:8px}
        button{display:block;margin:20px auto 0;padding:12px 24px;background:#087653;color:white;border:0;border-radius:8px;font-size:16px}
        @media print{body{background:white;padding:0}.receipt{border:1px solid #16805d;margin:0 auto}button{display:none}}
      </style>
    </head>
    <body>
      <div class="receipt">
        <img class="logo" src="${LOGO_URL}" alt="সংগঠনের লোগো">
        <h1>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</h1>
        <div class="email">${contact.email}</div>
        <h2>টাকা জমার রশিদ</h2>
        <div class="line"><span>রশিদ নম্বর</span><b>${escapeHTML(number)}</b></div>
        <div class="line"><span>সদস্যের নাম</span><b>${escapeHTML(memberName)}</b></div>
        <div class="line"><span>সদস্য আইডি</span><b>${escapeHTML(memberId)}</b></div>
        <div class="line"><span>চাঁদার মাস</span><b>${escapeHTML(payment.month || '')}</b></div>
        <div class="line"><span>জমার তারিখ</span><b>${escapeHTML(receiptDate(payment))}</b></div>
        <div class="line"><span>জমার মাধ্যম</span><b>${escapeHTML(payment.method || 'নগদ')}</b></div>
        <div class="amount">${money(payment.amount)}</div>
        <div class="paid">পরিশোধ সম্পন্ন</div>
        <p style="text-align:center;font-size:12px">এটি সংগঠনের সংরক্ষিত ডিজিটাল রশিদ।</p>
        <button onclick="window.print()">রশিদ প্রিন্ট / PDF</button>
      </div>
    </body>
    </html>`;

  receiptWindow.document.open();
  receiptWindow.document.write(html);
  receiptWindow.document.close();
}

function renderPayments(payments) {
  if (!payments.length) return 'এখনো কোনো জমার তথ্য নেই।';

  return payments.map(p => `
    <div class="noticeitem">
      <b>${escapeHTML(p.month || '')}</b>
      <p>জমা: ${money(p.amount)}</p>
      <p>মাধ্যম: ${escapeHTML(p.method || 'নগদ')}</p>
      <p>রশিদ: ${escapeHTML(receiptNumber(p))}</p>
      <button class="primary" type="button"
        data-receipt="${escapeHTML(p.id)}">রশিদ দেখুন</button>
    </div>`).join('');
}

/* MEMBER DASHBOARD */

async function memberView() {
  const menuItems = [
    { id: 'home', icon: '⌂', label: 'হোম' },
    { id: 'dues', icon: '৳', label: 'আমার চাঁদা ও রশিদ' },
    { id: 'notices', icon: '▤', label: 'নোটিশ' },
    { id: 'activities', icon: '☆', label: 'কার্যক্রম' },
    { id: 'rules', icon: '📜', label: 'নিয়ম-কানুন' },
    { id: 'constitution', icon: '📖', label: 'গঠনতন্ত্র' },
    { id: 'contact', icon: '☎', label: 'যোগাযোগ' }
  ];

  app.innerHTML = baseHeader() + menuDrawer(menuItems) + `
    <main class="app-main">
      <div data-page="home">
        <section class="hero">
          <div class="eyebrow">MEMBER DASHBOARD</div>
          <h1>স্বাগতম</h1>
          <p>${escapeHTML(profile.phone || currentUser.phoneNumber)}</p>
          <span class="status">অনুমোদিত সদস্য</span>
        </section>

        <section class="panel">
          <h2 class="heading-blue">সদস্য পরিচিতি</h2>
          <p>সদস্য আইডি: ${escapeHTML(currentUser.uid.slice(0, 10).toUpperCase())}</p>
          <p>মোবাইল: ${escapeHTML(profile.phone || '')}</p>
          <p>অবস্থা: অনুমোদিত</p>
        </section>
      </div>

      <div data-page="dues" hidden>
        <section class="panel">
          <h2 class="heading-green">আমার চাঁদা</h2>
          <div id="myDues">লোড হচ্ছে...</div>
        </section>
        <section class="panel">
          <h2 class="heading-blue">আমার জমার ইতিহাস ও ডিজিটাল রশিদ</h2>
          <div id="myPayments">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="notices" hidden>
        <section class="panel">
          <h2 class="heading-red">নোটিশ ও ঘোষণা</h2>
          <div id="memberNotices">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="activities" hidden>
        <section class="panel">
          <h2 class="heading-purple">সংগঠনের কার্যক্রম</h2>
          <div id="memberActivities">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="rules" hidden>
        <section class="panel">
          <h2 class="heading-orange">সংগঠনের নিয়ম-কানুন</h2>
          <div id="memberRules">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="constitution" hidden>
        <section class="panel">
          <h2 class="heading-purple">সংগঠনের গঠনতন্ত্র</h2>
          <div id="memberConstitution">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="contact" hidden>${contactHTML()}</div>
    </main>

    ${bottomNavigation([
      { id: 'home', icon: '⌂', label: 'হোম' },
      { id: 'dues', icon: '৳', label: 'চাঁদা' },
      { id: 'notices', icon: '▤', label: 'নোটিশ' },
      { id: 'activities', icon: '☆', label: 'কার্যক্রম' },
      { id: 'contact', icon: '☎', label: 'যোগাযোগ' }
    ])}

    ${footer()}`;

  bindLogout();
  setupNavigation();

  try {
    const [dues, payments, notices, activities] = await Promise.all([
      getList('dues', [where('memberUid', '==', currentUser.uid)]),
      getList('payments', [where('memberUid', '==', currentUser.uid)]),
      getList('notices', [orderBy('createdAt', 'desc'), limit(30)]),
      getList('activities', [orderBy('createdAt', 'desc'), limit(30)])
    ]);

    $('#myDues').innerHTML = dues.length
      ? dues.map(d => `
        <div class="noticeitem">
          ${escapeHTML(d.month || '')} — ${money(d.amount)}
        </div>`).join('')
      : 'এখনো কোনো চাঁদা নির্ধারণ করা হয়নি।';

    $('#myPayments').innerHTML = renderPayments(payments);

    document.querySelectorAll('[data-receipt]').forEach(button => {
      button.onclick = () => {
        const payment = payments.find(p => p.id === button.dataset.receipt);
        if (payment) openReceipt(payment);
      };
    });

    $('#memberNotices').innerHTML = notices.length
      ? notices.map(n => `
        <div class="noticeitem">
          <h3>${escapeHTML(n.title)}</h3>
          <p>${escapeHTML(n.body)}</p>
        </div>`).join('')
      : 'এখনো কোনো নোটিশ প্রকাশিত হয়নি।';

    $('#memberActivities').innerHTML = activities.length
      ? activities.map(a => `
        <div class="noticeitem">
          <h3>${escapeHTML(a.title)}</h3>
          <p>${escapeHTML(a.body || '')}</p>
        </div>`).join('')
      : 'এখনো কোনো কার্যক্রম প্রকাশিত হয়নি।';

    await Promise.all([
      loadMemberRules(),
      loadMemberConstitution()
    ]);

  } catch (error) {
    console.error(error);
    alert('তথ্য লোড করতে সমস্যা হয়েছে।');
  }
}

/* ADMIN DASHBOARD */

async function adminView() {
  const menuItems = [
    { id: 'dashboard', icon: '⌂', label: 'ড্যাশবোর্ড' },
    { id: 'members', icon: '♙', label: 'সদস্য ও আবেদন' },
    { id: 'finance', icon: '🤲', label: 'চাঁদা ও আর্থিক হিসাব' },
    { id: 'content', icon: '▤', label: 'নোটিশ ও কার্যক্রম' },
    { id: 'rulesAdmin', icon: '📜', label: 'নিয়ম-কানুন পরিচালনা' },
    { id: 'constitutionAdmin', icon: '📖', label: 'গঠনতন্ত্র পরিচালনা' },
    { id: 'contact', icon: '☎', label: 'যোগাযোগ' }
  ];

  app.innerHTML = baseHeader() + menuDrawer(menuItems) + `
    <main class="app-main">
      <div data-page="dashboard">
        <section class="hero">
          <div class="eyebrow">ADMIN DASHBOARD</div>
          <h1>অ্যাডমিন প্যানেল</h1>
          <p>সংগঠনের সকল কার্যক্রম পরিচালনা করুন।</p>
        </section>

        <section class="tiles">
          <article><b id="memberCount">০</b><span>মোট সদস্য</span></article>
          <article><b id="pendingCount">০</b><span>নতুন আবেদন</span></article>
          <article><b id="donationTotal">৳ ০</b><span>মোট অনুদান</span></article>
          <article><b id="expenseTotal">৳ ০</b><span>মোট খরচ</span></article>
        </section>

        <section class="panel">
          <h2 class="heading-blue">আর্থিক হিসাবের সংক্ষিপ্ত বিবরণ</h2>
          <div id="financeReport">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="members" hidden>
        <section class="panel">
          <h2 class="heading-red">সদস্য আবেদন</h2>
          <div id="applicationList">লোড হচ্ছে...</div>
        </section>
        <section class="panel">
          <h2 class="heading-blue">সদস্য তালিকা</h2>
          <div id="memberList">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="finance" hidden>
        <section class="panel">
          <h2 class="heading-green">মাসিক চাঁদা নির্ধারণ</h2>
          <label>সদস্য নির্বাচন</label>
          <select id="dueMember"></select>
          <label>মাস</label>
          <input id="dueMonth" type="month">
          <label>চাঁদার পরিমাণ</label>
          <input id="dueAmount" type="number" min="100" max="5000">
          <button class="primary" id="saveDue">চাঁদা নির্ধারণ করুন</button>
        </section>

        <section class="panel">
          <h2 class="heading-blue">চাঁদা জমা গ্রহণ</h2>
          <label>সদস্য নির্বাচন</label>
          <select id="payMember"></select>
          <label>মাস</label>
          <input id="payMonth" type="month">
          <label>জমার পরিমাণ</label>
          <input id="payAmount" type="number" min="1">
          <label>জমার মাধ্যম</label>
          <select id="payMethod">
            <option>নগদ</option>
            <option>বিকাশ</option>
            <option>নগদ (Nagad)</option>
            <option>ব্যাংক</option>
            <option>অন্যান্য</option>
          </select>
          <button class="primary" id="savePayment">জমা সংরক্ষণ ও রশিদ তৈরি</button>
        </section>

        <section class="panel donation-panel">
          <h2 class="heading-purple">🤲 অনুদান ও মানবিক সহায়তা</h2>
          <p>সংগঠনের জনকল্যাণমূলক তহবিলে প্রাপ্ত অনুদানের তথ্য সংরক্ষণ করুন।</p>
          <label>দাতার নাম</label>
          <input id="donor" placeholder="দাতার নাম">
          <label>পরিমাণ</label>
          <input id="donationAmount" type="number" min="1">
          <label>উদ্দেশ্য</label>
          <input id="donationPurpose" placeholder="অনুদানের উদ্দেশ্য">
          <button class="primary" id="saveDonation">🤲 অনুদান সংরক্ষণ করুন</button>
        </section>

        <section class="panel">
          <h2 class="heading-red">খরচ যোগ করুন</h2>
          <label>খরচের বিবরণ</label>
          <input id="expensePurpose" placeholder="খরচের বিবরণ">
          <label>পরিমাণ</label>
          <input id="expenseAmount" type="number" min="1">
          <label>তারিখ</label>
          <input id="expenseDate" type="date">
          <button class="primary" id="saveExpense">খরচ সংরক্ষণ করুন</button>
        </section>

        <section class="panel">
          <h2 class="heading-blue">আর্থিক হিসাব</h2>
          <div id="financeReport2">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="content" hidden>
        <section class="panel">
          <h2 class="heading-red">নোটিশ প্রকাশ</h2>
          <label>নোটিশের শিরোনাম</label>
          <input id="noticeTitle">
          <label>নোটিশের বিবরণ</label>
          <textarea id="noticeBody"></textarea>
          <button class="primary" id="publishNotice">নোটিশ প্রকাশ করুন</button>
        </section>

        <section class="panel">
          <h2 class="heading-purple">কার্যক্রম যোগ করুন</h2>
          <label>কার্যক্রমের শিরোনাম</label>
          <input id="activityTitle">
          <label>বিবরণ</label>
          <textarea id="activityBody"></textarea>
          <button class="primary" id="saveActivity">কার্যক্রম প্রকাশ করুন</button>
        </section>
      </div>

      <div data-page="rulesAdmin" hidden>
        <section class="panel">
          <h2 class="heading-orange">নিয়ম-কানুন পরিচালনা</h2>
          <label>নিয়মের শিরোনাম</label>
          <input id="ruleTitle" placeholder="যেমন: ১. সদস্যপদ">
          <label>নিয়মের বিস্তারিত</label>
          <textarea id="ruleBody" rows="5"></textarea>
          <button class="primary" id="saveRule">নিয়ম সংরক্ষণ করুন</button>
          <button class="secondary" id="cancelRuleEdit" hidden>সম্পাদনা বাতিল</button>
        </section>

        <section class="panel">
          <h2 class="heading-blue">প্রকাশিত নিয়মাবলি</h2>
          <div id="adminRules">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="constitutionAdmin" hidden>
        <section class="panel">
          <h2 class="heading-purple">গঠনতন্ত্র পরিচালনা</h2>
          <p>গঠনতন্ত্র সাধারণ সভায় অনুমোদনের পর অনুমোদিত হিসেবে চিহ্নিত করুন।</p>

          <label>গঠনতন্ত্রের অনুমোদনের অবস্থা</label>
          <select id="constitutionStatus">
            <option value="draft">অনুমোদনের অপেক্ষায়</option>
            <option value="approved">সাধারণ সভায় অনুমোদিত</option>
          </select>
          <button class="secondary" id="saveConstitutionStatus">অবস্থা সংরক্ষণ করুন</button>

          <label>ধারা / অধ্যায়ের শিরোনাম</label>
          <input id="constitutionTitle" placeholder="যেমন: প্রথম অধ্যায় — নাম ও পরিচয়">
          <label>বিস্তারিত</label>
          <textarea id="constitutionBody" rows="7" placeholder="গঠনতন্ত্রের বিস্তারিত লিখুন"></textarea>
          <button class="primary" id="saveConstitution">গঠনতন্ত্র সংরক্ষণ করুন</button>
          <button class="secondary" id="cancelConstitutionEdit" hidden>সম্পাদনা বাতিল</button>
        </section>

        <section class="panel">
          <h2 class="heading-blue">সংরক্ষিত গঠনতন্ত্র</h2>
          <div id="adminConstitution">লোড হচ্ছে...</div>
        </section>
      </div>

      <div data-page="contact" hidden>${contactHTML()}</div>
    </main>

    ${bottomNavigation([
      { id: 'dashboard', icon: '⌂', label: 'হোম' },
      { id: 'members', icon: '♙', label: 'সদস্য' },
      { id: 'finance', icon: '🤲', label: 'হিসাব' },
      { id: 'content', icon: '▤', label: 'প্রকাশনা' },
      { id: 'contact', icon: '☎', label: 'যোগাযোগ' }
    ])}

    ${footer()}`;

  bindLogout();
  setupNavigation();

  $('#saveDue').onclick = saveDue;
  $('#savePayment').onclick = savePayment;
  $('#saveDonation').onclick = saveDonation;
  $('#saveExpense').onclick = saveExpense;
  $('#publishNotice').onclick = publishNotice;
  $('#saveActivity').onclick = saveActivity;
  $('#saveRule').onclick = saveRule;
  $('#cancelRuleEdit').onclick = cancelRuleEdit;
  $('#saveConstitution').onclick = saveConstitution;
  $('#cancelConstitutionEdit').onclick = cancelConstitutionEdit;
  $('#saveConstitutionStatus').onclick = saveConstitutionStatus;

  await refreshAdmin();
}

/* DEFAULT CONSTITUTION STORAGE */

async function ensureDefaultConstitution(items) {
  const chapters = items.filter(item => item.id !== '_settings');

  if (chapters.length) return chapters;

  const defaults = defaultConstitution();

  for (let i = 0; i < defaults.length; i++) {
    await addDoc(collection(db, 'constitution'), {
      ...defaults[i],
      sortOrder: i + 1,
      isDefault: true,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
  }

  return (await getList('constitution'))
    .filter(x => x.id !== '_settings');
}

/* ADMIN DATA */

async function refreshAdmin() {
  try {
    const [users, dues, payments, donations, expenses, rules, constitution] =
      await Promise.all([
        getList('users'),
        getList('dues'),
        getList('payments'),
        getList('donations'),
        getList('expenses'),
        getList('rules'),
        getList('constitution')
      ]);

    await loadConstitutionStatus();

    const members = users.filter(u => u.status === 'approved');
    const pending = users.filter(u => u.status === 'pending');

    $('#memberCount').textContent = members.length.toLocaleString('bn-BD');
    $('#pendingCount').textContent = pending.length.toLocaleString('bn-BD');

    const donationSum = donations.reduce(
      (s, x) => s + Number(x.amount || 0), 0
    );

    const expenseSum = expenses.reduce(
      (s, x) => s + Number(x.amount || 0), 0
    );

    $('#donationTotal').textContent = money(donationSum);
    $('#expenseTotal').textContent = money(expenseSum);

    $('#applicationList').innerHTML = pending.length
      ? pending.map(u => `
        <div class="applicant">
          <span>${escapeHTML(u.phone || '')}</span>
          <span>
            <button data-approve="${escapeHTML(u.id)}">অনুমোদন</button>
            <button data-reject="${escapeHTML(u.id)}">বাতিল</button>
          </span>
        </div>`).join('')
      : 'নতুন আবেদন নেই।';

    document.querySelectorAll('[data-approve]').forEach(button => {
      button.onclick = () =>
        changeStatus(button.dataset.approve, 'approved');
    });

    document.querySelectorAll('[data-reject]').forEach(button => {
      button.onclick = () =>
        changeStatus(button.dataset.reject, 'rejected');
    });

    $('#memberList').innerHTML = members.length
      ? members.map(u => `
        <div class="noticeitem">
          <b>${escapeHTML(u.phone || '')}</b>
          <p>সদস্য আইডি: ${escapeHTML(u.id.slice(0, 10).toUpperCase())}</p>
          <p>ভূমিকা: ${escapeHTML(u.role || 'member')}</p>
        </div>`).join('')
      : 'কোনো অনুমোদিত সদস্য নেই।';

    const options = members.map(u => `
      <option value="${escapeHTML(u.id)}"
        data-phone="${escapeHTML(u.phone || '')}">
        ${escapeHTML(u.phone || u.id)}
      </option>`).join('');

    $('#dueMember').innerHTML =
      '<option value="">সদস্য নির্বাচন করুন</option>' + options;

    $('#payMember').innerHTML =
      '<option value="">সদস্য নির্বাচন করুন</option>' + options;

    const paymentSum = payments.reduce(
      (s, x) => s + Number(x.amount || 0), 0
    );

    const dueSum = dues.reduce(
      (s, x) => s + Number(x.amount || 0), 0
    );

    const report = `
      <p>মোট নির্ধারিত চাঁদা: <b>${money(dueSum)}</b></p>
      <p>মোট জমা: <b>${money(paymentSum)}</b></p>
      <p>মোট অনুদান: <b>${money(donationSum)}</b></p>
      <p>মোট খরচ: <b>${money(expenseSum)}</b></p>
      <p>জমা ও অনুদান থেকে খরচ বাদে:
        <b>${money(paymentSum + donationSum - expenseSum)}</b>
      </p>`;

    $('#financeReport').innerHTML = report;
    $('#financeReport2').innerHTML = report;

    renderAdminRules(rules);

    const constitutionItems = await ensureDefaultConstitution(constitution);

    renderAdminConstitution(sortByOrder(constitutionItems));

    if ($('#constitutionStatus')) {
      $('#constitutionStatus').value = constitutionStatus;
    }

  } catch (error) {
    console.error(error);
    alert('অ্যাডমিন তথ্য লোড হয়নি। Firestore Rules পরীক্ষা করুন।');
  }
}

async function changeStatus(uid, status) {
  try {
    await updateDoc(doc(db, 'users', uid), { status });
    alert('সদস্যের অবস্থা পরিবর্তন হয়েছে।');
    await refreshAdmin();
  } catch (error) {
    alert('পরিবর্তন করা যায়নি: ' + error.message);
  }
}

function selectedMember(id) {
  const select = $(id);
  const uid = select.value;
  const phone = select.selectedOptions[0]?.dataset.phone || '';

  if (!uid) throw new Error('সদস্য নির্বাচন করুন।');

  return { uid, phone };
}

/* DUES AND PAYMENTS */

async function saveDue() {
  try {
    const member = selectedMember('#dueMember');
    const month = $('#dueMonth').value;
    const amount = Number($('#dueAmount').value);

    if (!month || amount < 100 || amount > 5000) {
      throw new Error('মাস নির্বাচন করুন এবং ১০০ থেকে ৫,০০০ টাকার মধ্যে চাঁদা দিন।');
    }

    await addDoc(collection(db, 'dues'), {
      memberUid: member.uid,
      memberPhone: member.phone,
      month,
      amount,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('চাঁদা নির্ধারণ করা হয়েছে।');
    $('#dueAmount').value = '';
    await refreshAdmin();

  } catch (error) {
    alert(error.message);
  }
}

async function savePayment() {
  try {
    const member = selectedMember('#payMember');
    const month = $('#payMonth').value;
    const amount = Number($('#payAmount').value);
    const method = $('#payMethod').value;

    if (!month || amount <= 0) {
      throw new Error('মাস ও সঠিক জমার পরিমাণ দিন।');
    }

    const memberSnap = await getDoc(doc(db, 'users', member.uid));
    const memberData = memberSnap.exists() ? memberSnap.data() : {};

    const memberName = memberData.name ||
      memberData.fullName ||
      member.phone ||
      'নাম সংরক্ষিত নেই';

    const memberId = member.uid.slice(0, 10).toUpperCase();

    const paymentRef = await addDoc(collection(db, 'payments'), {
      memberUid: member.uid,
      memberName,
      memberId,
      memberPhone: member.phone,
      month,
      amount,
      method,
      status: 'approved',
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    const receiptNo =
      'UNSKS-' + paymentRef.id.slice(-10).toUpperCase();

    await updateDoc(paymentRef, { receiptNo });

    alert('জমা সংরক্ষণ হয়েছে। ডিজিটাল রশিদ তৈরি হয়েছে।');

    $('#payAmount').value = '';
    await refreshAdmin();

  } catch (error) {
    console.error(error);
    alert('জমা সংরক্ষণে সমস্যা হয়েছে: ' + error.message);
  }
}

/* DONATIONS AND EXPENSES */

async function saveDonation() {
  try {
    const donor = $('#donor').value.trim();
    const amount = Number($('#donationAmount').value);
    const purpose = $('#donationPurpose').value.trim();

    if (!donor || amount <= 0 || !purpose) {
      throw new Error('সব তথ্য পূরণ করুন।');
    }

    await addDoc(collection(db, 'donations'), {
      donor,
      amount,
      purpose,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('অনুদান সংরক্ষণ হয়েছে।');

    $('#donor').value = '';
    $('#donationAmount').value = '';
    $('#donationPurpose').value = '';

    await refreshAdmin();

  } catch (error) {
    alert(error.message);
  }
}

async function saveExpense() {
  try {
    const purpose = $('#expensePurpose').value.trim();
    const amount = Number($('#expenseAmount').value);
    const date = $('#expenseDate').value;

    if (!purpose || amount <= 0 || !date) {
      throw new Error('সব তথ্য পূরণ করুন।');
    }

    await addDoc(collection(db, 'expenses'), {
      purpose,
      amount,
      date,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('খরচ সংরক্ষণ হয়েছে।');

    $('#expensePurpose').value = '';
    $('#expenseAmount').value = '';
    $('#expenseDate').value = '';

    await refreshAdmin();

  } catch (error) {
    alert(error.message);
  }
}

/* NOTICES AND ACTIVITIES */

async function publishNotice() {
  try {
    const title = $('#noticeTitle').value.trim();
    const body = $('#noticeBody').value.trim();

    if (!title || !body) {
      throw new Error('শিরোনাম ও বিবরণ লিখুন।');
    }

    await addDoc(collection(db, 'notices'), {
      title,
      body,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('নোটিশ প্রকাশ হয়েছে।');
    $('#noticeTitle').value = '';
    $('#noticeBody').value = '';

  } catch (error) {
    alert(error.message);
  }
}

async function saveActivity() {
  try {
    const title = $('#activityTitle').value.trim();
    const body = $('#activityBody').value.trim();

    if (!title || !body) {
      throw new Error('শিরোনাম ও বিবরণ লিখুন।');
    }

    await addDoc(collection(db, 'activities'), {
      title,
      body,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('কার্যক্রম প্রকাশ হয়েছে।');
    $('#activityTitle').value = '';
    $('#activityBody').value = '';

  } catch (error) {
    alert(error.message);
  }
}

/* ADMIN RULE MANAGEMENT */

function renderAdminRules(rules) {
  const box = $('#adminRules');
  if (!box) return;

  box.innerHTML = rules.length
    ? rules.map(r => `
      <div class="noticeitem">
        <h3>${escapeHTML(r.title)}</h3>
        <p>${escapeHTML(r.body)}</p>
        <button class="secondary"
          data-edit-rule="${escapeHTML(r.id)}">সম্পাদনা</button>
        <button class="danger-btn"
          data-delete-rule="${escapeHTML(r.id)}">মুছুন</button>
      </div>`).join('')
    : '<p>এখনো কোনো নিয়ম সংরক্ষণ করা হয়নি।</p>';

  document.querySelectorAll('[data-edit-rule]').forEach(button => {
    button.onclick = () => editRule(button.dataset.editRule, rules);
  });

  document.querySelectorAll('[data-delete-rule]').forEach(button => {
    button.onclick = () => deleteRule(button.dataset.deleteRule);
  });
}

async function saveRule() {
  try {
    const title = $('#ruleTitle').value.trim();
    const body = $('#ruleBody').value.trim();

    if (!title || !body) {
      throw new Error('নিয়মের শিরোনাম ও বিস্তারিত লিখুন।');
    }

    if (editingTermId) {
      await updateDoc(doc(db, 'rules', editingTermId), {
        title,
        body,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      alert('নিয়ম সম্পাদনা করা হয়েছে।');

    } else {
      await addDoc(collection(db, 'rules'), {
        title,
        body,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });

      alert('নতুন নিয়ম সংরক্ষণ হয়েছে।');
    }

    cancelRuleEdit();
    renderAdminRules(await getList('rules'));

  } catch (error) {
    alert(error.message);
  }
}

function editRule(id, rules) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return;

  editingTermId = id;

  $('#ruleTitle').value = rule.title || '';
  $('#ruleBody').value = rule.body || '';
  $('#saveRule').textContent = 'পরিবর্তন সংরক্ষণ করুন';
  $('#cancelRuleEdit').hidden = false;

  document.querySelector('[data-page-link="rulesAdmin"]')?.click();
}

function cancelRuleEdit() {
  editingTermId = null;

  $('#ruleTitle').value = '';
  $('#ruleBody').value = '';
  $('#saveRule').textContent = 'নিয়ম সংরক্ষণ করুন';
  $('#cancelRuleEdit').hidden = true;
}

async function deleteRule(id) {
  if (!confirm('আপনি কি এই নিয়মটি মুছে ফেলতে চান?')) return;

  try {
    await deleteDoc(doc(db, 'rules', id));
    alert('নিয়ম মুছে ফেলা হয়েছে।');
    renderAdminRules(await getList('rules'));

  } catch (error) {
    alert('নিয়ম মুছতে সমস্যা হয়েছে: ' + error.message);
  }
}

/* ADMIN CONSTITUTION MANAGEMENT */

function renderAdminConstitution(items) {
  const box = $('#adminConstitution');
  if (!box) return;

  const sorted = sortByOrder(
    items.filter(item => item.id !== '_settings')
  );

  box.innerHTML = sorted.length
    ? sorted.map(item => `
      <div class="noticeitem">
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.body)}</p>
        <button class="secondary"
          data-edit-constitution="${escapeHTML(item.id)}">সম্পাদনা</button>
        <button class="danger-btn"
          data-delete-constitution="${escapeHTML(item.id)}">মুছুন</button>
      </div>`).join('')
    : '<p>গঠনতন্ত্রের কোনো অংশ নেই।</p>';

  document.querySelectorAll('[data-edit-constitution]').forEach(button => {
    button.onclick = () =>
      editConstitution(button.dataset.editConstitution, sorted);
  });

  document.querySelectorAll('[data-delete-constitution]').forEach(button => {
    button.onclick = () =>
      deleteConstitution(button.dataset.deleteConstitution);
  });
}

async function saveConstitution() {
  try {
    const title = $('#constitutionTitle').value.trim();
    const body = $('#constitutionBody').value.trim();

    if (!title || !body) {
      throw new Error('গঠনতন্ত্রের শিরোনাম ও বিস্তারিত লিখুন।');
    }

    if (editingConstitutionId) {
      await updateDoc(doc(db, 'constitution', editingConstitutionId), {
        title,
        body,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      alert('গঠনতন্ত্র সম্পাদনা করা হয়েছে।');

    } else {
      const existing = (await getList('constitution'))
        .filter(item => item.id !== '_settings');

      const nextOrder = existing.reduce(
        (max, item) => Math.max(max, Number(item.sortOrder || 0)), 0
      ) + 1;

      await addDoc(collection(db, 'constitution'), {
        title,
        body,
        sortOrder: nextOrder,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });

      alert('গঠনতন্ত্র সংরক্ষণ হয়েছে।');
    }

    cancelConstitutionEdit();
    renderAdminConstitution(await getList('constitution'));

  } catch (error) {
    alert(error.message);
  }
}

function editConstitution(id, items) {
  if (id === '_settings') return;

  const item = items.find(x => x.id === id);
  if (!item) return;

  editingConstitutionId = id;

  $('#constitutionTitle').value = item.title || '';
  $('#constitutionBody').value = item.body || '';
  $('#saveConstitution').textContent = 'পরিবর্তন সংরক্ষণ করুন';
  $('#cancelConstitutionEdit').hidden = false;

  document.querySelector('[data-page-link="constitutionAdmin"]')?.click();
}

function cancelConstitutionEdit() {
  editingConstitutionId = null;

  $('#constitutionTitle').value = '';
  $('#constitutionBody').value = '';
  $('#saveConstitution').textContent = 'গঠনতন্ত্র সংরক্ষণ করুন';
  $('#cancelConstitutionEdit').hidden = true;
}

async function deleteConstitution(id) {
  if (id === '_settings') return;

  if (!confirm('আপনি কি এই গঠনতন্ত্রের অংশটি মুছে ফেলতে চান?')) return;

  try {
    await deleteDoc(doc(db, 'constitution', id));
    alert('গঠনতন্ত্রের অংশ মুছে ফেলা হয়েছে।');
    renderAdminConstitution(await getList('constitution'));

  } catch (error) {
    alert('মুছতে সমস্যা হয়েছে: ' + error.message);
  }
}

/* APP START */

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    profile = null;
    confirmation = null;

    loginView();
    return;
  }

  try {
    await loadUser(user);

  } catch (error) {
    console.error(error);

    app.innerHTML = `
      <main>
        <section class="panel">
          <h2 class="heading-red">তথ্য লোড করা যায়নি</h2>
          <p>${escapeHTML(error.message)}</p>
          <button class="secondary" id="tryAgain">আবার চেষ্টা করুন</button>
          <button class="ghost" id="errorLogout">লগআউট</button>
        </section>
      </main>`;

    $('#tryAgain').onclick = () => loadUser(user);
    $('#errorLogout').onclick = () => signOut(auth);
  }
});
