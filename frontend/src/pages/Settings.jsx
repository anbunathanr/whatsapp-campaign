import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, Lock, Smartphone, Key, ExternalLink, Info, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import authService from '../services/authService';

const Settings = () => {
  const [formData, setFormData] = useState({
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioWhatsappFrom: '',
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const res = await authService.getCredentials();
      if (res && res.data) {
        setFormData({
          twilioAccountSid: res.data.twilioAccountSid || '',
          twilioAuthToken: res.data.twilioAuthToken || '',
          twilioWhatsappFrom: res.data.twilioWhatsappFrom || '',
        });
      }
    } catch (err) {
      setError('Failed to load API credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await authService.updateCredentials(formData);
      setSuccess('Credentials saved successfully. Your campaigns will now use these API keys.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save credentials.');
    } finally {
      setSaving(false);
    }
  };

  const [guideOpen, setGuideOpen] = useState(true);
  const inputCls = "w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors";
  const labelCls = "block text-sm font-medium text-slate-300 mb-1.5";

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const steps = [
    {
      num: 1,
      title: 'Create or log in to your Twilio account',
      desc: 'Sign up at twilio.com for a free trial, or log in to your existing account. You will need a paid account to use the official WhatsApp Business API.',
      link: 'https://www.twilio.com/try-twilio',
      linkLabel: 'Sign up at twilio.com →',
    },
    {
      num: 2,
      title: 'Complete Business Verification',
      desc: 'Twilio requires you to verify your business identity before enabling the WhatsApp Business API. Go to Console → Settings → Business Profile and fill in your company details.',
      link: 'https://console.twilio.com/us1/account/business-profile',
      linkLabel: 'Open Business Profile →',
    },
    {
      num: 3,
      title: 'Submit a WhatsApp Business Profile application',
      desc: 'In the Console, navigate to Messaging → Senders → WhatsApp Senders. Click "Apply for WhatsApp" and provide your Facebook Business Manager ID, business display name, and approved use case.',
      link: 'https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders',
      linkLabel: 'WhatsApp Senders →',
    },
    {
      num: 4,
      title: 'Wait for Meta / WhatsApp approval',
      desc: 'Meta reviews your application and approves the WhatsApp Business Account (WABA). This typically takes 1–5 business days. You will be notified via email when approved.',
    },
    {
      num: 5,
      title: 'Get your Account SID and Auth Token',
      desc: 'After approval, log in to the Twilio Console Dashboard. Your Account SID (starts with AC...) and Auth Token are displayed in the Account Info section. Copy both.',
      link: 'https://console.twilio.com',
      linkLabel: 'Open Twilio Console →',
    },
    {
      num: 6,
      title: 'Note your approved WhatsApp sender number',
      desc: 'Under Messaging → Senders → WhatsApp Senders, you will see your approved sender phone number. It must be entered in E.164 format with the whatsapp: prefix, e.g. whatsapp:+919876543210',
      link: 'https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders',
      linkLabel: 'View WhatsApp Senders →',
    },
    {
      num: 7,
      title: 'Enter your credentials here & save',
      desc: 'Paste your Account SID, Auth Token, and approved WhatsApp sender number into the form below and click Save Configuration. Your campaigns will start sending via the official API.',
    },
    {
      num: 8,
      title: 'Configure Webhook for Status Callbacks & Replies',
      desc: 'To receive delivery receipts, read statuses, and incoming messages in your Analytics dashboard, configure your WhatsApp sender webhook in Twilio. Go to Senders -> WhatsApp Senders -> Configure. Set the "Webhook URL for incoming messages" to your server URL ending with /api/webhooks/whatsapp',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings & Integrations</h1>
          <p className="text-slate-400 mt-1">Manage your platform configuration and API connections.</p>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{success}</p>
          </div>
        )}

        {/* ── Twilio Setup Guide ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setGuideOpen(o => !o)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
                <Info className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h2 className="text-base font-semibold text-white">How to get your Twilio credentials</h2>
                <p className="text-slate-400 text-xs mt-0.5">Step-by-step guide to set up Twilio WhatsApp API</p>
              </div>
            </div>
            {guideOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>

          {guideOpen && (
            <div className="px-5 pb-5 space-y-3 border-t border-slate-800">
              {/* Quick link bar */}
              <div className="flex flex-wrap gap-2 pt-4">
                <a
                  href="https://www.twilio.com/try-twilio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  twilio.com
                </a>
                <a
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Twilio Console
                </a>
                <a
                  href="https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  WhatsApp Senders
                </a>
                <a
                  href="https://www.twilio.com/en-us/whatsapp/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-xs font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  API Docs
                </a>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                {steps.map((step) => (
                  <div key={step.num} className="flex gap-3 p-3 bg-slate-800/60 rounded-xl">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mt-0.5">
                      {step.num}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{step.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                      {step.link && (
                        <a
                          href={step.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {step.linkLabel}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tip box */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-300 leading-relaxed">
                  <strong>💡 Production Tip:</strong> The official WhatsApp Business API requires Meta / Facebook Business Manager verification. Make sure your business Facebook page is verified and your WABA (WhatsApp Business Account) is linked to your Twilio account before submitting the sender application.
                </p>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-xs text-blue-300 leading-relaxed">
                  <strong>📋 Message Templates:</strong> For outbound marketing campaigns via the official API, all messages must use pre-approved WhatsApp Message Templates. You can manage templates in the{' '}
                  <a href="https://console.twilio.com/us1/develop/sms/content-template-builder" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">Twilio Content Template Builder</a>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Credentials Form ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-800">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">WhatsApp Business API</h2>
                <p className="text-slate-400 text-sm">Connect your Twilio account to send campaigns.</p>
              </div>
            </div>
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <p className="text-sm text-blue-300 leading-relaxed">
                <strong>Note:</strong> If you leave these fields blank, the system will use the default shared platform credentials. For your custom brand name to appear, you must provide your own verified Twilio account keys.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className={labelCls}>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-500" />
                  Account SID
                </div>
              </label>
              <input
                type="text"
                name="twilioAccountSid"
                value={formData.twilioAccountSid}
                onChange={handleChange}
                placeholder="AC..."
                className={inputCls}
              />
              <p className="text-xs text-slate-500 mt-1">
                Found on your{' '}
                <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">Twilio Console</a>{' '}homepage. Starts with <span className="font-mono bg-slate-800 px-1 rounded text-slate-300">AC</span>.
              </p>
            </div>

            <div>
              <label className={labelCls}>
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-500" />
                  Auth Token
                </div>
              </label>
              <input
                type="text"
                name="twilioAuthToken"
                value={formData.twilioAuthToken}
                onChange={handleChange}
                placeholder="Enter your auth token"
                className={inputCls}
              />
              {formData.twilioAuthToken.includes('*') && (
                <p className="text-xs text-yellow-500/70 mt-1">Your token is currently hidden for security. Entering a new value will overwrite it.</p>
              )}
            </div>

            <div>
              <label className={labelCls}>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-500" />
                  WhatsApp Sender Number
                </div>
              </label>
              <input
                type="text"
                name="twilioWhatsappFrom"
                value={formData.twilioWhatsappFrom}
                onChange={handleChange}
                placeholder="whatsapp:+1234567890"
                className={inputCls}
              />
              <p className="text-xs text-slate-500 mt-1">
                Must include the <span className="font-mono bg-slate-800 px-1 rounded text-slate-300">whatsapp:</span> prefix and country code. Sandbox default: <span className="font-mono bg-slate-800 px-1 rounded text-slate-300">whatsapp:+14155238886</span>
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Save Configuration
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
