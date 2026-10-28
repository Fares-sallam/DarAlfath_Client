# Production password recovery

The storefront and mobile app both request a Supabase Auth **Recovery** email and
verify its OTP with `type: 'recovery'`. The dashboard also uses the same Auth
project, so every Auth email consumes the same project-wide sending quota.

**Release blocker:** The project owner has not yet configured a verified sending
domain or an SMTP provider. Do not claim that production OTP delivery is fixed,
or raise the Auth email rate limit, until both are in place and a real message
has been received and verified end to end. Supabase's built-in sender is limited
to 2 emails per hour per project, including on a Pro plan, and only delivers to
pre-authorized project-team addresses. It is not a production sender.

## Required Supabase configuration

1. Choose a transactional SMTP provider (for example, Resend), register or use
   a domain you control, and verify the sending subdomain with that provider.
   Configure it in Authentication > SMTP Settings. Use
   a verified sending domain and a dedicated sender such as
   `no-reply@auth.example.com`. Keep SMTP credentials in Supabase, never in
   the storefront, mobile app, repository, or Vercel client environment.
2. Configure SPF, DKIM, and DMARC for the sending domain at the DNS provider.
3. In Authentication > Email Templates > Reset password, include the numeric
   `{{ .Token }}`. Both apps expect the OTP in this template. A minimal body is:

   ```html
   <p>رمز إعادة تعيين كلمة المرور: <strong>{{ .Token }}</strong></p>
   <p>إذا لم تطلب تغيير كلمة المرور، تجاهل هذه الرسالة.</p>
   ```

4. In Authentication > Rate Limits, set Emails sent per hour to a sustainable
   value within the provider's own quota **after SMTP is active**. The limit is shared by signup,
   confirmation, password recovery, and the dashboard. Keep the per-address
   resend cooldown enabled and monitor Auth logs for HTTP 429 and SMTP errors.
5. If the Recovery template also includes a link, allow the storefront's
   `/account?mode=reset` redirect in Authentication > URL Configuration.
   The OTP flow itself does not require clicking a link.

## Release check

Use a dedicated test account and request a single reset code from the website.
Verify that the Recovery email contains a code, that the code opens the new
password form, and that the new password signs in. Repeat once in the mobile
app after its updated build is installed. Check Auth logs for `/recover` and
`/verify` success, and check the email provider's delivery log. Never test by
repeatedly sending production emails to the same address.
