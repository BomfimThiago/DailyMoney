from app.core.exceptions import AppError


class StatementError(AppError):
    """The file as a whole can't be read (bad rows are collected, not raised)."""

    status_code = 422
    code = "STATEMENT_UNREADABLE"
