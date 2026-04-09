from datetime import datetime, timedelta
from typing import Optional
import uuid
import secrets
from passlib.context import CryptContext
from jose import JWTError, jwt
from app.config import settings
from app.models.user import User, UserRole, UserStatus, RegistrationSource
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Service for authentication operations."""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def create_access_token(user_id: uuid.UUID, email: str, role: str) -> str:
        """Create a JWT access token."""
        to_encode = {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "exp": datetime.utcnow() + timedelta(hours=24),
        }
        encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm="HS256")
        return encoded_jwt

    @staticmethod
    def decode_token(token: str) -> Optional[dict]:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
            return payload
        except JWTError:
            return None

    @staticmethod
    async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
        """Get a user by email."""
        result = await db.execute(select(User).where(User.email == email))
        return result.scalars().first()

    @staticmethod
    async def create_user(
        db: AsyncSession,
        email: str,
        password: str,
        display_name: Optional[str] = None,
        role: UserRole = UserRole.user,
        status: UserStatus = UserStatus.active,
        registration_source: RegistrationSource = RegistrationSource.self_registered,
    ) -> User:
        """Create a new user."""
        hashed_password = AuthService.hash_password(password)
        user = User(
            email=email,
            hashed_password=hashed_password,
            display_name=display_name,
            role=role,
            status=status,
            registration_source=registration_source,
            is_active=(status == UserStatus.active),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def authenticate_user(
        db: AsyncSession, email: str, password: str
    ) -> Optional[User]:
        """Authenticate a user and return the user if successful."""
        user = await AuthService.get_user_by_email(db, email)
        if not user:
            return None
        if not AuthService.verify_password(password, user.hashed_password):
            return None
        return user

    # ── Password reset ──────────────────────────────────────────────

    @staticmethod
    def generate_reset_token() -> str:
        """Generate a secure random reset token."""
        return secrets.token_urlsafe(48)

    @staticmethod
    async def create_password_reset_token(
        db: AsyncSession, user: User, expires_hours: int = 24
    ) -> str:
        """Create a password reset token for a user. Returns the token."""
        token = AuthService.generate_reset_token()
        user.password_reset_token = AuthService.hash_password(token)
        user.password_reset_token_expires = datetime.utcnow() + timedelta(hours=expires_hours)
        await db.commit()
        await db.refresh(user)
        return token

    @staticmethod
    async def validate_reset_token(
        db: AsyncSession, token: str
    ) -> Optional[User]:
        """Validate a password reset token. Returns the user if valid."""
        # We need to check all users with non-null tokens since we hash them
        result = await db.execute(
            select(User).where(
                User.password_reset_token.isnot(None),
                User.password_reset_token_expires > datetime.utcnow(),
            )
        )
        users = result.scalars().all()
        for user in users:
            if AuthService.verify_password(token, user.password_reset_token):
                return user
        return None

    @staticmethod
    async def reset_password_with_token(
        db: AsyncSession, token: str, new_password: str
    ) -> Optional[User]:
        """Reset password using a valid token. Returns user on success."""
        user = await AuthService.validate_reset_token(db, token)
        if not user:
            return None
        user.hashed_password = AuthService.hash_password(new_password)
        user.password_reset_token = None
        user.password_reset_token_expires = None
        user.force_password_reset = False
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def force_password_change(
        db: AsyncSession, user_id: uuid.UUID
    ) -> Optional[User]:
        """Flag a user to force password change at next login."""
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            return None
        user.force_password_reset = True
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def change_password(
        db: AsyncSession, user: User, new_password: str
    ) -> User:
        """Change a user's password and clear the force reset flag."""
        user.hashed_password = AuthService.hash_password(new_password)
        user.force_password_reset = False
        user.password_reset_token = None
        user.password_reset_token_expires = None
        await db.commit()
        await db.refresh(user)
        return user
