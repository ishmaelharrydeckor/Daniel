# Editing the site without code

The site has an admin page at **`/admin/`** (for example `https://ishmaelharrydeckor.github.io/Daniel/admin/`).
It lets Daniel add or change blog posts, projects, career entries, achievements, testimonials, photos and the main text.

## What he can edit

| Tab | What it controls |
|---|---|
| Profile and text | Name, intro line, portrait, About text, the four roles, section intros, contact email, social links, search/sharing text |
| Projects | The big stacking cards. Name, type, years, role tags, photo, optional link |
| Career | Timeline cards. Title, organisation, years, logo or short label |
| Achievements | Awards, certificates, milestones. The section hides when empty |
| Blog | Articles written in the admin (with photos) or links to posts elsewhere. The newest four show on the home page, all posts at `/blog/` |
| Testimonials | Quotes with optional photo. The section hides when empty |
| Photo strip | The moving photo strip under the projects |

Each list supports **Add**, **Edit**, **Delete** and **↑ ↓ reordering**. Photos are resized automatically in the browser before upload.

After pressing **Save and publish**, the badge at the top shows *Publishing…* and then *Live ✓*. It usually takes one to two minutes.

## Signing in (one-time setup)

The admin saves by committing to the site's GitHub repository, so it needs an **access key**. Anyone without a key can open the page but cannot change anything.

The person who manages the repository creates the key:

1. Sign in to GitHub and open <https://github.com/settings/personal-access-tokens/new>.
2. Name: `Site admin`. Expiration: choose a date (the key stops working then and a new one is needed).
3. **Repository access**: *Only select repositories* → pick this site's repository.
4. **Permissions → Repository permissions**: set **Contents** to *Read and write*. Optionally set **Actions** to *Read-only* so the admin can show "Live ✓".
5. Generate the token, copy it, and give it to Daniel. He pastes it into the admin once. It is stored only in that browser; **Sign out** removes it.

Notes:
- A key belongs to the person who created it and can be revoked at any time at <https://github.com/settings/personal-access-tokens>.
- GitHub only lets a fine-grained key reach repositories its owner owns. If Daniel should use his own key, transfer the repository to his GitHub account first (Settings → Danger zone → Transfer), then he creates the key himself.
- Treat the key like a password. Don't send it over public chat or email.

## How it works (for whoever maintains the code)

- Content lives in `content/*.json`. Uploaded photos go to `uploads/`.
- `node src/build.mjs` generates the whole site into `dist/` (home page, one page per article, `/blog/`, and the admin).
- `.github/workflows/deploy.yml` runs that build on every push to `main` and publishes `dist/` to GitHub Pages. GitHub Pages must be set to **Source: GitHub Actions** (Settings → Pages).
- The admin (`admin/`) reads and writes `content/*.json` through the GitHub API. It never talks to any other server.
- If a build fails, the previous version of the site stays live; the admin shows *Publishing failed*.
- Preview locally: `node src/build.mjs`, then serve `dist/` with any static server. `admin/?demo` on localhost runs the admin without GitHub (changes are not saved).

## Limits to know about

- Only one person should edit at a time. If the content changed somewhere else, the admin asks you to reload instead of overwriting it.
- Social icons: LinkedIn, Facebook and X are supported.
- The four roles are fixed at four (they match the four chips around the portrait).
- The contact form opens the visitor's email app addressed to the email set in *Profile and text*. For a form that sends straight to an inbox, a form service (such as Formspree) can be added later.
