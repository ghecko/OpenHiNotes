"""Email service for sending password reset and account notification emails.

Uses SMTP settings stored in app_settings. If no SMTP is configured,
email sending is silently skipped (callers must check is_configured() first).
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.app_settings import AppSetting

logger = logging.getLogger(__name__)

# app_settings keys for SMTP configuration
_SMTP_KEYS = {
    "smtp_host": "",
    "smtp_port": "587",
    "smtp_username": "",
    "smtp_password": "",
    "smtp_from_email": "",
    "smtp_from_name": "OpenHiNotes",
    "smtp_use_tls": "true",
}


class EmailSettingsService:
    """Read/write SMTP settings from app_settings table."""

    @staticmethod
    async def _get(db: AsyncSession, key: str) -> str:
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalars().first()
        return row.value if row else _SMTP_KEYS.get(key, "")

    @staticmethod
    async def _set(db: AsyncSession, key: str, value: str, description: Optional[str] = None) -> None:
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalars().first()
        if row:
            row.value = value
        else:
            row = AppSetting(key=key, value=value, description=description or key)
            db.add(row)

    @staticmethod
    async def get_all(db: AsyncSession) -> dict:
        """Return all SMTP settings."""
        settings = {}
        for key in _SMTP_KEYS:
            settings[key] = await EmailSettingsService._get(db, key)
        return settings

    @staticmethod
    async def is_configured(db: AsyncSession) -> bool:
        """Check if SMTP is configured (host and from_email are required)."""
        host = await EmailSettingsService._get(db, "smtp_host")
        from_email = await EmailSettingsService._get(db, "smtp_from_email")
        return bool(host and host.strip() and from_email and from_email.strip())

    @staticmethod
    async def update(db: AsyncSession, updates: dict) -> dict:
        """Update SMTP settings. Only updates keys that are provided."""
        descriptions = {
            "smtp_host": "SMTP server hostname",
            "smtp_port": "SMTP server port",
            "smtp_username": "SMTP authentication username",
            "smtp_password": "SMTP authentication password",
            "smtp_from_email": "Sender email address",
            "smtp_from_name": "Sender display name",
            "smtp_use_tls": "Use TLS/STARTTLS (true/false)",
        }
        for key, value in updates.items():
            if key in _SMTP_KEYS:
                await EmailSettingsService._set(db, key, str(value), descriptions.get(key))
        await db.commit()
        return await EmailSettingsService.get_all(db)


class EmailService:
    """Send emails using configured SMTP settings."""

    @staticmethod
    async def send_email(
        db: AsyncSession,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> bool:
        """Send an email. Returns True on success, False on failure."""
        smtp_settings = await EmailSettingsService.get_all(db)

        host = smtp_settings.get("smtp_host", "").strip()
        if not host:
            logger.warning("SMTP not configured, cannot send email to %s", to_email)
            return False

        port = int(smtp_settings.get("smtp_port", "587"))
        username = smtp_settings.get("smtp_username", "").strip()
        password = smtp_settings.get("smtp_password", "").strip()
        from_email = smtp_settings.get("smtp_from_email", "").strip()
        from_name = smtp_settings.get("smtp_from_name", "OpenHiNotes").strip()
        use_tls = smtp_settings.get("smtp_use_tls", "true").lower() == "true"

        if not from_email:
            logger.warning("SMTP from_email not configured")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
        msg["To"] = to_email

        if text_body:
            msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            if use_tls:
                server = smtplib.SMTP(host, port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP(host, port, timeout=10)

            if username and password:
                server.login(username, password)

            server.sendmail(from_email, [to_email], msg.as_string())
            server.quit()
            logger.info("Email sent to %s: %s", to_email, subject)
            return True
        except Exception:
            logger.exception("Failed to send email to %s", to_email)
            return False

    @staticmethod
    async def send_password_reset_email(
        db: AsyncSession,
        to_email: str,
        reset_link: str,
        display_name: Optional[str] = None,
    ) -> bool:
        """Send a password reset email with a reset link."""
        name = display_name or to_email
        subject = "Password Reset Request - OpenHiNotes"
        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">OpenHiNotes</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 16px;">Hi {name},</p>
                <p style="color: #374151; font-size: 14px;">A password reset has been requested for your account. Click the button below to set a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" style="background: #4f46e5; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 13px;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="color: #6b7280; font-size: 12px; word-break: break-all;">{reset_link}</p>
                <p style="color: #6b7280; font-size: 13px;">This link will expire in 24 hours. If you didn't request this reset, you can safely ignore this email.</p>
            </div>
        </body>
        </html>
        """
        text_body = f"Hi {name},\n\nA password reset has been requested. Visit this link to set a new password:\n\n{reset_link}\n\nThis link expires in 24 hours.\n\nIf you didn't request this, ignore this email."
        return await EmailService.send_email(db, to_email, subject, html_body, text_body)

    @staticmethod
    async def send_account_created_email(
        db: AsyncSession,
        to_email: str,
        temp_password: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> bool:
        """Send a welcome email when admin creates an account."""
        name = display_name or to_email
        subject = "Your OpenHiNotes Account Has Been Created"

        password_section = ""
        if temp_password:
            password_section = f"""
                <p style="color: #374151; font-size: 14px;">Your temporary password is:</p>
                <div style="background: #f3f4f6; padding: 12px 20px; border-radius: 8px; text-align: center; margin: 15px 0;">
                    <code style="font-size: 16px; color: #1f2937; letter-spacing: 1px;">{temp_password}</code>
                </div>
                <p style="color: #dc2626; font-size: 13px; font-weight: 600;">You will be required to change this password on your first login.</p>
            """

        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">OpenHiNotes</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <p style="color: #374151; font-size: 16px;">Hi {name},</p>
                <p style="color: #374151; font-size: 14px;">An administrator has created an OpenHiNotes account for you.</p>
                <p style="color: #374151; font-size: 14px;">Your email: <strong>{to_email}</strong></p>
                {password_section}
            </div>
        </body>
        </html>
        """
        text_body = f"Hi {name},\n\nAn OpenHiNotes account has been created for you.\nEmail: {to_email}\n"
        if temp_password:
            text_body += f"Temporary password: {temp_password}\nYou must change this on first login.\n"
        return await EmailService.send_email(db, to_email, subject, html_body, text_body)
