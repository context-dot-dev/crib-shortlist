# Criblist

Criblist turns live San Francisco rental inventory into a small, preference-matched set of apartment choices.

## Language

**Listing Source**:
A configured path for acquiring current rental listings from one provider.
_Avoid_: Provider, feed

**Provider**:
The marketplace or property manager that publishes a rental listing and is shown to the renter.
_Avoid_: Listing Source

**Search Lane**:
A renter-facing selection of Listing Sources that can be searched together.
_Avoid_: Category, source group

**Apartment Card**:
A normalized rental listing with the facts, imagery, match reasons, and caveats needed for comparison.
_Avoid_: Result, item

**Apartment Deck**:
The ranked and source-diversified set of Apartment Cards shown during a hunt.
_Avoid_: Results list, response

**Listing Inventory**:
The persisted Apartment Cards most recently acquired from each Listing Source.
_Avoid_: Cache, database rows

**Preferences**:
The renter's budget, home requirements, and optional must-have filters for a hunt.
_Avoid_: Filters, criteria

## Relationships

- A **Listing Source** acquires **Apartment Cards** from exactly one **Provider**
- A **Search Lane** contains one or more **Listing Sources**
- A **Listing Source** refreshes one segment of **Listing Inventory**
- **Preferences** determine which **Apartment Cards** enter an **Apartment Deck**
- An **Apartment Deck** can be built from live acquisitions or **Listing Inventory**
- An **Apartment Deck** contains no more than eight **Apartment Cards**

## Example dialogue

> **Dev:** "Does choosing the Extract **Search Lane** change how an **Apartment Card** is ranked?"
> **Domain expert:** "No. The lane selects **Listing Sources**; every card then crosses the same **Preferences** and **Apartment Deck** rules."

## Flagged ambiguities

- "source" and "provider" were used interchangeably — resolved: a **Listing Source** is the acquisition path, while a **Provider** is the listing's displayed origin.
