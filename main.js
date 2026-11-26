
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
  getDocs, orderBy, limit, addDoc, serverTimestamp,
  updateDoc
} from 'firebase/firestore';

const $ = (s) => document.querySelector(s);

let confirmation = null;
let recaptcha = null;
let currentUser = null;
let profile = null;

const app = $('#app');
const LOGO_URL = '/logo.png';

const contact = {
  phone: '+8801602267423',
  email: 'uttarnoltek.sks.official2026@gmail.com',
  facebook: 'https://www.facebook.com/share/151EhhMPwC7/'
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);
}

function logoHTML() {
  return `
    <img
      class="brandmark"
      src="${LOGO_URL}"
      alt="উত্তর নলটেক সমাজ কল্যাণ সংগঠনের লোগো"
      onerror="this.outerHTML='<div class=&quot;brandmark&quot;>উ</div>'"
    >
  `;
}

function formatPhone(value) {
  let p = value.replace(/[\s-]/g, '');

  if (/^01\d{9}$/.test(p)) return '+88' + p;
  if (/^05\d{8}$/.test(p)) return '+966' + p.slice(1);
  if (/^5\d{8}$/.test(p)) return '+966' + p;
  if (/^\+8801\d{9}$/.test(p)) return p;
  if (/^\+9665\d{8}$/.test(p)) return p;

  throw new Error('সঠিক বাংলাদেশি অথবা সৌদি মোবাইল নম্বর দিন।');
}

function loginView() {
  app.innerHTML = `
    <header>
      ${logoHTML()}
      <div>
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="eyebrow">WELCOME</div>
        <h1>স্বাগতম</h1>
        <p>উত্তর নলটেক সমাজ কল্যাণ সংগঠনের সদস্য প্ল্যাটফর্মে আপনাকে স্বাগতম।</p>
      </section>

      <section class="panel">
        <h2>সদস্য লগইন</h2>
        <label>মোবাইল নম্বর</label>
        <input id="phone" placeholder="01XXXXXXXXX অথবা 05XXXXXXXX" />
        <div id="recaptcha-container"></div>
        <button class="primary" id="sendOtp">OTP পাঠান</button>

        <div id="otpArea" hidden>
          <label>OTP কোড</label>
          <input id="otp" inputmode="numeric" placeholder="৬ সংখ্যার কোড" />
          <button class="primary" id="verifyOtp">যাচাই করুন</button>
        </div>

        <p class="hint" id="message"></p>
      </section>
    </main>

    ${footer()}
  `;

  $('#sendOtp').onclick = sendOtp;
  $('#verifyOtp').onclick = verifyOtp;
}

async function sendOtp() {
  const message = $('#message');

  try {
    const phone = formatPhone($('#phone').value.trim());
    $('#sendOtp').disabled = true;
    message.textContent = 'OTP পাঠানো হচ্ছে...';

    if (!recaptcha) {
      recaptcha = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        { size: 'normal' }
      );
      await recaptcha.render();
    }

    confirmation = await signInWithPhoneNumber(auth, phone, recaptcha);
    $('#otpArea').hidden = false;
    message.textContent = 'OTP পাঠানো হয়েছে। কোড লিখুন।';
  } catch (error) {
    message.textContent = error.message || 'OTP পাঠানো যায়নি।';
    $('#sendOtp').disabled = false;
  }
}

async function verifyOtp() {
  try {
    const code = $('#otp').value.trim();

    if (!confirmation || !code) {
      throw new Error('OTP কোড লিখুন।');
    }

    $('#verifyOtp').disabled = true;
    await confirmation.confirm(code);
  } catch (error) {
    $('#message').textContent = 'OTP সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।';
    $('#verifyOtp').disabled = false;
  }
}

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

  if (profile.status !== 'approved') {
    return pendingView();
  }

  if (profile.role === 'admin') {
    return adminView();
  }

  return memberView();
}

function baseHeader() {
  return `
    <header>
      ${logoHTML()}
      <div>
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
      <button class="ghost" id="logout">লগআউট</button>
    </header>
  `;
}

function footer() {
  return `
    <footer>
      মানবতার সেবায় · উত্তর নলটেক, বাঘড়া, শ্রীনগর, মুন্সীগঞ্জ
    </footer>
  `;
}

function bindLogout() {
  $('#logout').onclick = async () => {
    await signOut(auth);
  };
}

function pendingView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="panel center">
        <h2>আবেদন জমা হয়েছে</h2>
        <p>আপনার সদস্য আবেদন অ্যাডমিনের অনুমোদনের অপেক্ষায় রয়েছে।</p>
        <span class="status">অনুমোদনের অপেক্ষায়</span>
      </section>
    </main>
  ` + footer();

  bindLogout();
}

function rejectedView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="panel center">
        <h2>আবেদন অনুমোদিত হয়নি</h2>
        <p>বিস্তারিত জানতে সংগঠনের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।</p>
      </section>
    </main>
  ` + footer();

  bindLogout();
}

async function getList(name, filters = []) {
  let q = collection(db, name);

  if (filters.length) {
    q = query(q, ...filters);
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function money(amount) {
  return '৳ ' + Number(amount || 0).toLocaleString('bn-BD');
}

function contactHTML() {
  return `
    <section class="panel">
      <h2>যোগাযোগ</h2>
      <p>মোবাইল: <a href="tel:${contact.phone}">${contact.phone}</a></p>
      <p>ইমেইল: <a href="mailto:${contact.email}">${contact.email}</a></p>
      <p><a href="${contact.facebook}" target="_blank" rel="noopener">Facebook পেজ</a></p>
    </section>
  `;
}

async function memberView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="hero">
        <div class="eyebrow">MEMBER DASHBOARD</div>
        <h1>সদস্য পরিচিতি</h1>
        <p>${escapeHTML(profile.phone || currentUser.phoneNumber)}</p>
        <span class="status">অনুমোদিত সদস্য</span>
      </section>

      <section class="panel">
        <h2>সদস্য তথ্য</h2>
        <p>সদস্য আইডি: ${escapeHTML(currentUser.uid.slice(0, 10).toUpperCase())}</p>
        <p>মোবাইল: ${escapeHTML(profile.phone || '')}</p>
      </section>

      <section class="panel">
        <h2>আমার চাঁদা</h2>
        <div id="myDues">লোড হচ্ছে...</div>
      </section>

      <section class="panel">
        <h2>আমার জমার ইতিহাস</h2>
        <div id="myPayments">লোড হচ্ছে...</div>
      </section>

      <section class="panel">
        <h2>নোটিশ ও ঘোষণা</h2>
        <div id="memberNotices">লোড হচ্ছে...</div>
      </section>

      <section class="panel">
        <h2>সংগঠনের কার্যক্রম</h2>
        <div id="memberActivities">লোড হচ্ছে...</div>
      </section>

      ${contactHTML()}
    </main>
  ` + footer();

  bindLogout();

  try {
    const [dues, payments, notices, activities] = await Promise.all([
      getList('dues', [where('memberUid', '==', currentUser.uid)]),
      getList('payments', [where('memberUid', '==', currentUser.uid)]),
      getList('notices', [orderBy('createdAt', 'desc'), limit(30)]),
      getList('activities', [orderBy('createdAt', 'desc'), limit(30)])
    ]);

    $('#myDues').innerHTML = dues.length
      ? dues.map(d => `<div class="noticeitem">${escapeHTML(d.month)} — ${money(d.amount)}</div>`).join('')
      : 'এখনো কোনো চাঁদা নির্ধারণ করা হয়নি।';

    $('#myPayments').innerHTML = payments.length
      ? payments.map(p => `<div class="noticeitem">${escapeHTML(p.month)} — ${money(p.amount)} — ${escapeHTML(p.method || 'নগদ')}</div>`).join('')
      : 'এখনো কোনো জমার তথ্য নেই।';

    $('#memberNotices').innerHTML = notices.length
      ? notices.map(n => `<div class="noticeitem"><b>${escapeHTML(n.title)}</b><p>${escapeHTML(n.body)}</p></div>`).join('')
      : 'এখনো কোনো নোটিশ প্রকাশিত হয়নি।';

    $('#memberActivities').innerHTML = activities.length
      ? activities.map(a => `<div class="noticeitem"><b>${escapeHTML(a.title)}</b><p>${escapeHTML(a.body || '')}</p></div>`).join('')
      : 'এখনো কোনো কার্যক্রম প্রকাশিত হয়নি।';
  } catch (error) {
    console.error(error);
    alert('তথ্য লোড করতে সমস্যা হয়েছে।');
  }
}

async function adminView() {
  app.innerHTML = baseHeader() + `
    <main>
      <section class="hero">
        <div class="eyebrow">ADMIN DASHBOARD</div>
        <h1>অ্যাডমিন প্যানেল</h1>
        <p>সংগঠনের সদস্য ও সকল কার্যক্রম পরিচালনা করুন।</p>
      </section>

      <section class="tiles">
        <article><b id="memberCount">০</b><span>মোট সদস্য</span></article>
        <article><b id="pendingCount">০</b><span>নতুন আবেদন</span></article>
        <article><b id="donationTotal">৳ ০</b><span>মোট অনুদান</span></article>
        <article><b id="expenseTotal">৳ ০</b><span>মোট খরচ</span></article>
      </section>

      <section class="panel">
        <h2>সদস্য আবেদন</h2>
        <div id="applicationList">লোড হচ্ছে...</div>
      </section>

      <section class="panel">
        <h2>সদস্য তালিকা</h2>
        <div id="memberList">লোড হচ্ছে...</div>
      </section>

      <section class="panel">
        <h2>মাসিক চাঁদা নির্ধারণ</h2>
        <label>সদস্য নির্বাচন</label>
        <select id="dueMember"></select>
        <label>মাস</label>
        <input id="dueMonth" type="month" />
        <label>চাঁদার পরিমাণ (১০০–৫০০০ টাকা)</label>
        <input id="dueAmount" type="number" min="100" max="5000" />
        <button class="primary" id="saveDue">চাঁদা নির্ধারণ করুন</button>
      </section>

      <section class="panel">
        <h2>চাঁদা জমা গ্রহণ</h2>
        <label>সদস্য নির্বাচন</label>
        <select id="payMember"></select>
        <label>মাস</label>
        <input id="payMonth" type="month" />
        <label>জমার পরিমাণ</label>
        <input id="payAmount" type="number" min="1" />
        <label>জমার মাধ্যম</label>
        <select id="payMethod">
          <option>নগদ</option>
          <option>বিকাশ</option>
          <option>নগদ (Nagad)</option>
          <option>ব্যাংক</option>
          <option>অন্যান্য</option>
        </select>
        <button class="primary" id="savePayment">জমা সংরক্ষণ করুন</button>
      </section>

      <section class="panel">
        <h2>অনুদান যোগ করুন</h2>
        <label>দাতার নাম</label>
        <input id="donor" placeholder="দাতার নাম" />
        <label>পরিমাণ</label>
        <input id="donationAmount" type="number" min="1" />
        <label>উদ্দেশ্য</label>
        <input id="donationPurpose" placeholder="অনুদানের উদ্দেশ্য" />
        <button class="primary" id="saveDonation">অনুদান সংরক্ষণ করুন</button>
      </section>

      <section class="panel">
        <h2>খরচ যোগ করুন</h2>
        <label>খরচের বিবরণ</label>
        <input id="expensePurpose" placeholder="খরচের বিবরণ" />
        <label>পরিমাণ</label>
        <input id="expenseAmount" type="number" min="1" />
        <label>তারিখ</label>
        <input id="expenseDate" type="date" />
        <button class="primary" id="saveExpense">খরচ সংরক্ষণ করুন</button>
      </section>

      <section class="panel">
        <h2>নোটিশ প্রকাশ</h2>
        <label>নোটিশের শিরোনাম</label>
        <input id="noticeTitle" />
        <label>নোটিশের বিবরণ</label>
        <textarea id="noticeBody"></textarea>
        <button class="primary" id="publishNotice">নোটিশ প্রকাশ করুন</button>
      </section>

      <section class="panel">
        <h2>কার্যক্রম যোগ করুন</h2>
        <label>কার্যক্রমের শিরোনাম</label>
        <input id="activityTitle" />
        <label>বিবরণ</label>
        <textarea id="activityBody"></textarea>
        <button class="primary" id="saveActivity">কার্যক্রম প্রকাশ করুন</button>
      </section>

      <section class="panel">
        <h2>আর্থিক হিসাব</h2>
        <div id="financeReport">লোড হচ্ছে...</div>
      </section>

      ${contactHTML()}
    </main>
  ` + footer();

  bindLogout();

  $('#saveDue').onclick = saveDue;
  $('#savePayment').onclick = savePayment;
  $('#saveDonation').onclick = saveDonation;
  $('#saveExpense').onclick = saveExpense;
  $('#publishNotice').onclick = publishNotice;
  $('#saveActivity').onclick = saveActivity;

  await refreshAdmin();
}

async function refreshAdmin() {
  try {
    const [users, dues, payments, donations, expenses] = await Promise.all([
      getList('users'),
      getList('dues'),
      getList('payments'),
      getList('donations'),
      getList('expenses')
    ]);

    const members = users.filter(u => u.status === 'approved');
    const pending = users.filter(u => u.status === 'pending');

    $('#memberCount').textContent = members.length.toLocaleString('bn-BD');
    $('#pendingCount').textContent = pending.length.toLocaleString('bn-BD');

    const donationSum = donations.reduce((s, x) => s + Number(x.amount || 0), 0);
    const expenseSum = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);

    $('#donationTotal').textContent = money(donationSum);
    $('#expenseTotal').textContent = money(expenseSum);

    $('#applicationList').innerHTML = pending.length
      ? pending.map(u => `
        <div class="applicant">
          <span>${escapeHTML(u.phone || '')}</span>
          <span>
            <button data-approve="${u.id}">অনুমোদন</button>
            <button data-reject="${u.id}">বাতিল</button>
          </span>
        </div>
      `).join('')
      : 'নতুন আবেদন নেই।';

    document.querySelectorAll('[data-approve]').forEach(b => {
      b.onclick = () => changeStatus(b.dataset.approve, 'approved');
    });

    document.querySelectorAll('[data-reject]').forEach(b => {
      b.onclick = () => changeStatus(b.dataset.reject, 'rejected');
    });

    $('#memberList').innerHTML = members.length
      ? members.map(u => `
        <div class="noticeitem">
          <b>${escapeHTML(u.phone || '')}</b>
          <p>সদস্য আইডি: ${escapeHTML(u.id.slice(0, 10).toUpperCase())}</p>
          <p>ভূমিকা: ${escapeHTML(u.role || 'member')}</p>
        </div>
      `).join('')
      : 'কোনো অনুমোদিত সদস্য নেই।';

    const options = members.map(u =>
      `<option value="${escapeHTML(u.id)}" data-phone="${escapeHTML(u.phone || '')}">${escapeHTML(u.phone || u.id)}</option>`
    ).join('');

    $('#dueMember').innerHTML = options;
    $('#payMember').innerHTML = options;

    const paymentSum = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
    const dueSum = dues.reduce((s, x) => s + Number(x.amount || 0), 0);

    $('#financeReport').innerHTML = `
      <p>মোট নির্ধারিত চাঁদা: <b>${money(dueSum)}</b></p>
      <p>মোট জমা: <b>${money(paymentSum)}</b></p>
      <p>মোট অনুদান: <b>${money(donationSum)}</b></p>
      <p>মোট খরচ: <b>${money(expenseSum)}</b></p>
      <p>অনুদান ও জমা থেকে খরচ বাদে: <b>${money(paymentSum + donationSum - expenseSum)}</b></p>
    `;
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

async function saveDue() {
  try {
    const member = selectedMember('#dueMember');
    const month = $('#dueMonth').value;
    const amount = Number($('#dueAmount').value);

    if (!month || amount < 100 || amount > 5000) {
      throw new Error('মাস নির্বাচন করুন এবং ১০০ থেকে ৫০০০ টাকার মধ্যে চাঁদা দিন।');
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

    await addDoc(collection(db, 'payments'), {
      memberUid: member.uid,
      memberPhone: member.phone,
      month,
      amount,
      method,
      status: 'approved',
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });

    alert('জমার তথ্য সংরক্ষণ হয়েছে।');
    $('#payAmount').value = '';
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function saveDonation() {
  try {
    const donor = $('#donor').value.trim();
    const amount = Number($('#donationAmount').value);
    const purpose = $('#donationPurpose').value.trim();

    if (!donor || amount <= 0 || !purpose) {
      throw new Error('সব তথ্য পূরণ করুন।');
    }

    await addDoc(collection(db, 'donations'), {
      donor, amount, purpose,
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
      purpose, amount, date,
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

async function publishNotice() {
  try {
    const title = $('#noticeTitle').value.trim();
    const body = $('#noticeBody').value.trim();

    if (!title || !body) {
      throw new Error('শিরোনাম ও বিবরণ লিখুন।');
    }

    await addDoc(collection(db, 'notices'), {
      title, body,
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
      title, body,
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

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    profile = null;
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
          <h2>তথ্য লোড করা যায়নি</h2>
          <p>${escapeHTML(error.message)}</p>
          <button class="secondary" id="tryAgain">আবার চেষ্টা করুন</button>
        </section>
      </main>
    `;

    $('#tryAgain').onclick = () => loadUser(user);
  }
});
