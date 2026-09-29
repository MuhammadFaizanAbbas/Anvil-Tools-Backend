const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function mailTemplate({ title, intro = '', body = '', buttonText, buttonUrl, preheader = '' }) {
  const paragraphs = String(body).split(/\n\s*\n/).filter(Boolean)
    .map(text => `<p style="margin:0 0 16px;color:#40506a;font-size:15px;line-height:1.7;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`).join('');
  const button = buttonText && buttonUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0;"><tr><td style="border-radius:8px;background:#3157e7;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:13px 22px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;">${escapeHtml(buttonText)}</a></td></tr></table>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#172742;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:30px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #dfe6ef;border-radius:16px;overflow:hidden;"><tr><td style="padding:22px 30px;background:#152845;color:#fff;font-size:20px;font-weight:700;">Anvil Tools</td></tr><tr><td style="padding:34px 30px;"><h1 style="margin:0 0 14px;font-size:27px;line-height:1.25;color:#172742;">${escapeHtml(title)}</h1>${intro ? `<p style="margin:0 0 22px;color:#5b6b83;font-size:16px;line-height:1.65;">${escapeHtml(intro)}</p>` : ''}${paragraphs}${button}<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e6ebf3;color:#7a8799;font-size:12px;line-height:1.6;">Sent by Anvil Tools · Developed by VelloxTech</p></td></tr></table></td></tr></table></body></html>`;
}

module.exports = { mailTemplate, escapeHtml };
