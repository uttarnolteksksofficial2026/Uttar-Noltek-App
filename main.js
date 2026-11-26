
import './style.css';
import { auth, db } from './firebase.js';

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  doc, getDoc, setDoc, updateDoc, collection, query,
  where, getDocs, orderBy, limit, addDoc, serverTimestamp
} from 'firebase/firestore';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

let confirmation = null;
let recaptcha = null;
let currentUser = null;
let profile = null;

const money = n => Number(n || 0).toLocaleString('bn-BD') + ' টাকা';
const monthNow = () => new Date().toISOString().slice(0, 7);
const dateNow = () => new Date().toISOString().slice(0, 10);

const app = $('#app');
const logoUrl = '/logo.png';

function shell(content) {
  app.innerHTML = `
    <header>
      <img src="${logoUrl}" class="brandmark" alt="সংগঠনের লোগো">
      <div>
        <b>উত্তর নলটেক সমাজ কল্যাণ সংগঠন</b>
        <small>একতাই শক্তি · Unity is Strength</small>
      </div>
      <button id="lang" class="ghost">EN</button>
    </header>
    <main>${content}</main>
    <footer>
      মানবতার সেবায় · উত্তর নলটেক, বাঘড়া, শ্রীনগর, মুন্সীগঞ্জ
    </footer>
  `;

  $('#lang')?.addEventListener('click', () =>
    alert('English interface পরবর্তী সংস্করণে যোগ করা হবে।')
  );
}

function loginView() {
  shell(`
    <section class="hero">
      <span class="eyebrow">COMMUNITY • SERVICE • UNITY</span>
      <h1>একসাথে গড়ি<br>মানবিক সমাজ</h1>
      <p>সদস্য নিবন্ধন, চাঁদা, অনুদান ও সমাজকল্যাণমূলক কার্যক্রম।</p>
    </section>

    <section class="panel">
      <h2>সদস্য লগইন / নিবন্ধন</h2>
      <label>বাংলাদেশি অথবা সৌদি মোবাইল নম্বর</label>
      <input id="phone" placeholder="01XXXXXXXXX / 05XXXXXXXX" inputmode="tel">
      <button id="send" class="primary">OTP পাঠান</button>
      <div id="recaptcha-container"></div>
      <div id="otpbox" hidden>
        <label>SMS-এ পাওয়া OTP</label>
        <input id="otp" placeholder="৬ সংখ্যার OTP" inputmode="numeric">
        <button id="verify" class="primary">যাচাই করুন</button>
      </div>
      <p id="msg" class="hint">বাংলাদেশ ও সৌদি আরবের নম্বর ব্যবহার করতে পারবেন।</p>
    </section>
  `);

  $('#send').onclick = sendOtp;
  $('#verify').onclick = verifyOtp;
}

function phoneFormat(value) {
  let v = String(value || '').replace(/[\s()-]/g, '');
  if (v.startsWith('+')) return v;
  if (v.startsWith('880') || v.startsWith('966')) return '+' + v;
  if (/^01\d{9}$/.test(v)) return '+88' + v;
  if (/^05\d{8}$/.test(v)) return '+966' + v.slice(1);
  if (/^5\d{8}$/.test(v)) return '+966' + v;
  return v;
}

async function sendOtp() {
  const p = phoneFormat($('#phone').value);
  if (!/^\+8801\d{9}$/.test(p) && !/^\+9665\d{8}$/.test(p)) {
    $('#msg').textContent = 'সঠিক বাংলাদেশি অথবা সৌদি মোবাইল নম্বর দিন।';
    return;
  }

  $('#send').disabled = true;
  try {
    if (!recaptcha) {
      recaptcha = new RecaptchaVerifier(
        auth, 'recaptcha-container', { size: 'normal' }
      );
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
  if (!confirmation) return;
  try {
    await confirmation.confirm($('#otp').value.trim());
  } catch {
    $('#msg').textContent = 'OTP সঠিক নয় অথবা মেয়াদ শেষ হয়েছে।';
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

  if (profile.status === 'pending') return pendingView();
  if (profile.status === 'rejected') return rejectedView();

  if (profile.status !== 'approved') {
    return pendingView();
  }

  if (profile.role === 'admin') {
    await adminView();
  } else {
    await memberView();
  }
}

function pendingView() {
  shell(`
    <section class="panel center">
      <div class="status">আবেদন জমা হয়েছে</div>
      <h2>অ্যাডমিন অনুমোদনের অপেক্ষায়</h2>
      <p>আপনার মোবাইল নম্বর যাচাই হয়েছে। অনুমোদনের পর সদস্য সুবিধা চালু হবে।</p>
      <button id="out" class="secondary">লগআউট</button>
    </section>
  `);
  $('#out').onclick = () => signOut(auth);
}

function rejectedView() {
  shell(`
    <section class="panel center">
      <h2>আবেদন অনুমোদিত হয়নি</h2>
      <p>বিস্তারিত জানতে সংগঠনের অ্যাডমিনের সঙ্গে যোগাযোগ করুন।</p>
      <button id="out" class="secondary">লগআউট</button>
    </section>
  `);
  $('#out').onclick = () => signOut(auth);
}

function nav(title, description = '') {
  return `
    <section class="hero compact">
      <span class="eyebrow">UTTAR NOLTEK SKS</span>
      <h1>${title}</h1>
      <p>${description}</p>
    </section>
  `;
}

function contactSection() {
  return `
    <section class="panel">
      <h2>যোগাযোগ</h2>
      <p>📞 মোবাইল: <a href="tel:+8801602267423">+8801602267423</a></p>
      <p>✉️ ইমেল:
        <a href="mailto:uttarnoltek.sks.official2026@gmail.com">
          uttarnoltek.sks.official2026@gmail.com
        </a>
      </p>
      <p>🌐 Facebook:
        <a href="https://www.facebook.com/share/151EhhMPwC7/" target="_blank" rel="noopener">
          সংগঠনের Facebook পেজ
        </a>
      </p>
    </section>
  `;
}

async function getCollection(name, constraints = []) {
  const q = query(collection(db, name), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function memberView() {
  let notices = [], activities = [], dues = [], payments = [];

  try {
    notices = await getCollection('notices', [
      orderBy('createdAt', 'desc'), limit(10)
    ]);
    activities = await getCollection('activities', [
      orderBy('createdAt', 'desc'), limit(10)
    ]);
    dues = await getCollection('dues', [
      where('memberUid', '==', currentUser.uid)
    ]);
    payments = await getCollection('payments', [
      where('memberUid', '==', currentUser.uid)
    ]);
  } catch (e) {
    console.error(e);
  }

  const totalDue = dues.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const totalPaid = payments
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  shell(`
    ${nav('স্বাগতম', 'উত্তর নলটেক সমাজ কল্যাণ সংগঠনের সদস্য প্ল্যাটফর্ম')}

    <div class="tiles">
      <article><b>সদস্য পরিচিতি</b><span>${esc(profile.name || currentUser.phoneNumber)}</span></article>
      <article><b>সদস্য অবস্থা</b><span class="approved">অনুমোদিত</span></article>
      <article><b>নির্ধারিত চাঁদা</b><span>${money(totalDue)}</span></article>
      <article><b>অনুমোদিত জমা</b><span>${money(totalPaid)}</span></article>
    </div>

    <section class="panel">
      <h2>আমার সদস্য তথ্য</h2>
      <p>মোবাইল: ${esc(currentUser.phoneNumber)}</p>
      <p>সদস্য আইডি: ${esc(currentUser.uid.slice(0, 10).toUpperCase())}</p>
      <p>নাম: ${esc(profile.name || 'তথ্য দেওয়া হয়নি')}</p>
    </section>

    <section class="panel">
      <h2>আমার চাঁদার হিসাব</h2>
      ${dues.length ? dues.map(d => `
        <div class="noticeitem">
          <b>${esc(d.month || '')}</b>
          <p>নির্ধারিত: ${money(d.amount)}</p>
        </div>
      `).join('') : '<p class="hint">এখনো চাঁদা নির্ধারণ করা হয়নি।</p>'}
    </section>

    <section class="panel">
      <h2>আমার জমার ইতিহাস</h2>
      ${payments.length ? payments.map(p => `
        <div class="noticeitem">
          <b>${money(p.amount)}</b>
          <p>${esc(p.month || '')} · ${esc(p.status || 'অপেক্ষমাণ')}</p>
        </div>
      `).join('') : '<p class="hint">এখনো কোনো জমার তথ্য নেই।</p>'}
    </section>

    <section class="panel">
      <h2>নোটিশ ও ঘোষণা</h2>
      ${notices.length ? notices.map(n => `
        <div class="noticeitem">
          <b>${esc(n.title)}</b><p>${esc(n.body)}</p>
        </div>
      `).join('') : '<p class="hint">এখনো কোনো নোটিশ প্রকাশিত হয়নি।</p>'}
    </section>

    <section class="panel">
      <h2>সংগঠনের কার্যক্রম</h2>
      ${activities.length ? activities.map(a => `
        <div class="noticeitem">
          <b>${esc(a.title)}</b><p>${esc(a.description)}</p>
        </div>
      `).join('') : '<p class="hint">এখনো কোনো কার্যক্রম যোগ করা হয়নি।</p>'}
    </section>

    ${contactSection()}
    <button id="out" class="secondary full">লগআউট</button>
  `);

  $('#out').onclick = () => signOut(auth);
}

async function adminView() {
  let members = [], dues = [], payments = [], donations = [];
  let expenses = [], notices = [], activities = [];

  try {
    [
      members, dues, payments, donations, expenses, notices, activities
    ] = await Promise.all([
      getCollection('users'),
      getCollection('dues'),
      getCollection('payments'),
      getCollection('donations'),
      getCollection('expenses'),
      getCollection('notices', [orderBy('createdAt', 'desc'), limit(20)]),
      getCollection('activities', [orderBy('createdAt', 'desc'), limit(20)])
    ]);
  } catch (e) {
    console.error(e);
  }

  const pending = members.filter(m => m.status === 'pending');
  const approved = members.filter(m => m.status === 'approved');
  const paid = payments.filter(p => p.status === 'approved')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const donationTotal = donations.reduce((s, d) => s + Number(d.amount || 0), 0);
  const expenseTotal = expenses.reduce((s, d) => s + Number(d.amount || 0), 0);

  shell(`
    ${nav('সুপার অ্যাডমিন ড্যাশবোর্ড', 'সংগঠনের সকল কার্যক্রম পরিচালনা করুন')}

    <div class="tiles">
      <article><b>মোট সদস্য</b><span>${approved.length}</span></article>
      <article><b>অপেক্ষমাণ আবেদন</b><span>${pending.length}</span></article>
      <article><b>মোট চাঁদা জমা</b><span>${money(paid)}</span></article>
      <article><b>মোট অনুদান</b><span>${money(donationTotal)}</span></article>
      <article><b>মোট খরচ</b><span>${money(expenseTotal)}</span></article>
      <article><b>হিসাবের স্থিতি</b><span>${money(paid + donationTotal - expenseTotal)}</span></article>
    </div>

    <section class="panel">
      <h2>সদস্য আবেদন</h2>
      <div id="applicants">
        ${pending.length ? pending.map(m => `
          <div class="applicant">
            <span>${esc(m.phone)}</span>
            <button data-approve="${m.id}">অনুমোদন</button>
            <button data-reject="${m.id}">প্রত্যাখ্যান</button>
          </div>
        `).join('') : '<p class="hint">নতুন আবেদন নেই।</p>'}
      </div>
    </section>

    <section class="panel">
      <h2>সদস্য তালিকা</h2>
      <div class="table-wrap">
        <table>
          <tr><th>নাম / ফোন</th><th>অবস্থা</th><th>চাঁদা নির্ধারণ</th></tr>
          ${approved.map(m => `
            <tr>
              <td>${esc(m.name || m.phone || m.id)}</td>
              <td>${esc(m.status)}</td>
              <td>
                <button data-setdues="${m.id}" data-phone="${esc(m.phone || '')}">
                  চাঁদা সেট
                </button>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>সদস্যের মাসিক চাঁদা নির্ধারণ</h2>
      <label>সদস্য নির্বাচন</label>
      <select id="duemember">
        <option value="">সদস্য নির্বাচন করুন</option>
        ${approved.map(m => `
          <option value="${m.id}">${esc(m.name || m.phone || m.id)}</option>
        `).join('')}
      </select>
      <label>মাস</label>
      <input id="duemonth" type="month" value="${monthNow()}">
      <label>চাঁদার পরিমাণ (১০০–৫০০০ টাকা)</label>
      <input id="dueamount" type="number" min="100" max="5000" step="1" placeholder="যেমন 500">
      <button id="savedue" class="primary">চাঁদা নির্ধারণ করুন</button>
    </section>

    <section class="panel">
      <h2>চাঁদা জমা রেকর্ড</h2>
      <label>সদস্য</label>
      <select id="paymember">
        <option value="">সদস্য নির্বাচন করুন</option>
        ${approved.map(m => `
          <option value="${m.id}">${esc(m.name || m.phone || m.id)}</option>
        `).join('')}
      </select>
      <label>মাস</label>
      <input id="paymonth" type="month" value="${monthNow()}">
      <label>জমার পরিমাণ</label>
      <input id="payamount" type="number" min="1" placeholder="টাকার পরিমাণ">
      <label>জমার মাধ্যম</label>
      <select id="paymethod">
        <option>নগদ</option>
        <option>বিকাশ</option>
        <option>নগদ (Nagad)</option>
        <option>ব্যাংক</option>
        <option>অন্যান্য</option>
      </select>
      <button id="savepayment" class="primary">জমা নিশ্চিত করুন</button>
    </section>

    <section class="panel">
      <h2>অনুদান যোগ করুন</h2>
      <input id="donor" placeholder="দাতার নাম">
      <input id="donationamount" type="number" min="1" placeholder="অনুদানের পরিমাণ">
      <input id="donationpurpose" placeholder="অনুদানের উদ্দেশ্য">
      <button id="savedonation" class="primary">অনুদান সংরক্ষণ করুন</button>
    </section>

    <section class="panel">
      <h2>ব্যয়ের হিসাব</h2>
      <input id="expensepurpose" placeholder="খরচের বিবরণ">
      <input id="expenseamount" type="number" min="1" placeholder="খরচের পরিমাণ">
      <input id="expensedate" type="date" value="${dateNow()}">
      <button id="saveexpense" class="primary">ব্যয়ের হিসাব সংরক্ষণ</button>
    </section>

    <section class="panel">
      <h2>নোটিশ প্রকাশ</h2>
      <input id="ntitle" placeholder="নোটিশের শিরোনাম">
      <textarea id="nbody" placeholder="নোটিশের বিবরণ"></textarea>
      <button id="publish" class="primary">নোটিশ প্রকাশ করুন</button>
    </section>

    <section class="panel">
      <h2>সংগঠনের কার্যক্রম যোগ করুন</h2>
      <input id="activitytitle" placeholder="কার্যক্রমের নাম">
      <textarea id="activitydescription" placeholder="কার্যক্রমের বিবরণ"></textarea>
      <button id="saveactivity" class="primary">কার্যক্রম প্রকাশ করুন</button>
    </section>

    <section class="panel">
      <h2>হিসাবের সারাংশ</h2>
      <p>চাঁদা জমা: <b>${money(paid)}</b></p>
      <p>অনুদান: <b>${money(donationTotal)}</b></p>
      <p>ব্যয়: <b>${money(expenseTotal)}</b></p>
      <p>বর্তমান হিসাব: <b>${money(paid + donationTotal - expenseTotal)}</b></p>
      <p class="hint">এটি রেকর্ড করা লেনদেনের হিসাব; প্রকৃত ব্যাংক বা নগদ ব্যালেন্স নয়।</p>
    </section>

    ${contactSection()}
    <button id="out" class="secondary full">লগআউট</button>
  `);

  $('#out').onclick = () => signOut(auth);

  document.querySelectorAll('[data-approve]').forEach(b => {
    b.onclick = () => changeMemberStatus(b.dataset.approve, 'approved');
  });

  document.querySelectorAll('[data-reject]').forEach(b => {
    b.onclick = () => changeMemberStatus(b.dataset.reject, 'rejected');
  });

  document.querySelectorAll('[data-setdues]').forEach(b => {
    b.onclick = () => {
      $('#duemember').value = b.dataset.setdues;
      $('#duemonth').focus();
    };
  });

  $('#savedue').onclick = saveDue;
  $('#savepayment').onclick = savePayment;
  $('#savedonation').onclick = saveDonation;
  $('#saveexpense').onclick = saveExpense;
  $('#publish').onclick = publishNotice;
  $('#saveactivity').onclick = saveActivity;
}

async function changeMemberStatus(uid, status) {
  if (!confirm(status === 'approved' ? 'সদস্যকে অনুমোদন করবেন?' : 'আবেদন প্রত্যাখ্যান করবেন?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), { status });
    alert('সদস্যের অবস্থা পরিবর্তন হয়েছে।');
    await adminView();
  } catch (e) {
    alert('পরিবর্তন করা যায়নি: ' + e.message);
  }
}

async function saveDue() {
  const uid = $('#duemember').value;
  const month = $('#duemonth').value;
  const amount = Number($('#dueamount').value);

  if (!uid || !month || amount < 100 || amount > 5000) {
    return alert('সদস্য, মাস এবং ১০০ থেকে ৫০০০ টাকার মধ্যে চাঁদা দিন।');
  }

  try {
    const member = await getDoc(doc(db, 'users', uid));
    await addDoc(collection(db, 'dues'), {
      memberUid: uid,
      memberPhone: member.data()?.phone || '',
      month,
      amount,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('চাঁদা নির্ধারণ করা হয়েছে।');
    await adminView();
  } catch (e) {
    alert('চাঁদা সংরক্ষণ করা যায়নি: ' + e.message);
  }
}

async function savePayment() {
  const uid = $('#paymember').value;
  const month = $('#paymonth').value;
  const amount = Number($('#payamount').value);
  const method = $('#paymethod').value;

  if (!uid || !month || amount <= 0) return alert('সঠিক তথ্য পূরণ করুন।');

  try {
    const member = await getDoc(doc(db, 'users', uid));
    await addDoc(collection(db, 'payments'), {
      memberUid: uid,
      memberPhone: member.data()?.phone || '',
      month,
      amount,
      method,
      status: 'approved',
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('চাঁদা জমার হিসাব সংরক্ষিত হয়েছে।');
    await adminView();
  } catch (e) {
    alert('জমার তথ্য সংরক্ষণ করা যায়নি: ' + e.message);
  }
}

async function saveDonation() {
  const donor = $('#donor').value.trim();
  const amount = Number($('#donationamount').value);
  const purpose = $('#donationpurpose').value.trim();

  if (!donor || amount <= 0) return alert('দাতার নাম ও টাকার পরিমাণ দিন।');

  try {
    await addDoc(collection(db, 'donations'), {
      donor, amount, purpose,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('অনুদান সংরক্ষণ হয়েছে।');
    await adminView();
  } catch (e) {
    alert('অনুদান সংরক্ষণ করা যায়নি: ' + e.message);
  }
}

async function saveExpense() {
  const purpose = $('#expensepurpose').value.trim();
  const amount = Number($('#expenseamount').value);
  const date = $('#expensedate').value;

  if (!purpose || amount <= 0 || !date) return alert('ব্যয়ের বিবরণ, পরিমাণ ও তারিখ দিন।');

  try {
    await addDoc(collection(db, 'expenses'), {
      purpose, amount, date,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('ব্যয়ের হিসাব সংরক্ষিত হয়েছে।');
    await adminView();
  } catch (e) {
    alert('ব্যয়ের হিসাব সংরক্ষণ করা যায়নি: ' + e.message);
  }
}

async function publishNotice() {
  const title = $('#ntitle').value.trim();
  const body = $('#nbody').value.trim();

  if (!title || !body) return alert('নোটিশের শিরোনাম ও বিবরণ লিখুন।');

  try {
    await addDoc(collection(db, 'notices'), {
      title, body,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('নোটিশ প্রকাশিত হয়েছে।');
    await adminView();
  } catch (e) {
    alert('নোটিশ প্রকাশ করা যায়নি: ' + e.message);
  }
}

async function saveActivity() {
  const title = $('#activitytitle').value.trim();
  const description = $('#activitydescription').value.trim();

  if (!title || !description) return alert('কার্যক্রমের নাম ও বিবরণ লিখুন।');

  try {
    await addDoc(collection(db, 'activities'), {
      title, description,
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    });
    alert('কার্যক্রম প্রকাশিত হয়েছে।');
    await adminView();
  } catch (e) {
    alert('কার্যক্রম সংরক্ষণ করা যায়নি: ' + e.message);
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    loadUser(user).catch(e => {
      shell(`
        <section class="panel">
          <h2>লোড করতে সমস্যা হয়েছে</h2>
          <p>${esc(e.message)}</p>
          <button id="retry" class="secondary">আবার চেষ্টা করুন</button>
          <button id="out" class="secondary">লগআউট</button>
        </section>
      `);
      $('#retry').onclick = () => loadUser(user);
      $('#out').onclick = () => signOut(auth);
    });
  } else {
    currentUser = null;
    profile =
