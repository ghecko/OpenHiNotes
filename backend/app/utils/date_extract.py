"""Extract meeting date/time from HiDock device filenames.

Supported formats:
  - YYYYMMDDHHMMSS (14-digit prefix), e.g. 20250512114141.hda
  - YYYYMonDD-HHMMSS-*, e.g. 2025May12-114141-Rec44.hda

Returns a human-readable string like "May 12, 2025 at 11:41 AM"
or None if the filename doesn't match any known pattern.
"""

import re
from datetime import datetime
from typing import Optional

MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

# Pattern 1: 14-digit timestamp prefix
_RE_DIGITS = re.compile(r"^(\d{14})")

# Pattern 2: 2025May12-114141-Rec44.hda
_RE_MONTH_NAME = re.compile(
    r"^(\d{4})([A-Za-z]{3})(\d{1,2})-(\d{2})(\d{2})(\d{2})"
)


def extract_meeting_date(original_filename: str) -> Optional[str]:
    """Try to parse a date from a HiDock filename.

    Returns a formatted date string or None.
    """
    if not original_filename:
        return None

    # Strip path components if any
    name = original_filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]

    # Pattern 1: YYYYMMDDHHMMSS
    m = _RE_DIGITS.match(name)
    if m:
        try:
            dt = datetime.strptime(m.group(1), "%Y%m%d%H%M%S")
            return dt.strftime("%B %d, %Y at %I:%M %p")
        except ValueError:
            pass

    # Pattern 2: YYYYMonDD-HHMMSS
    m = _RE_MONTH_NAME.match(name)
    if m:
        year, month_str, day, hour, minute, second = m.groups()
        month_num = MONTH_MAP.get(month_str.capitalize())
        if month_num:
            try:
                dt = datetime(
                    int(year), month_num, int(day),
                    int(hour), int(minute), int(second),
                )
                return dt.strftime("%B %d, %Y at %I:%M %p")
            except ValueError:
                pass

    return None
