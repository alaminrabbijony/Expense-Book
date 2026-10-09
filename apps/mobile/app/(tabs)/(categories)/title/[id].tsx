/*
 * The title page, inside the Categories tab's own stack — the third copy of
 * this route, beside (home)'s and (all)'s.
 *
 * It exists because a card on a CATEGORY page can be tapped, and the title
 * page it opens has to be pushed inside the tab the tap happened in. Without
 * this file, expo-router would resolve /title/<id> to another tab's copy and
 * the tap would jump you out of Categories.
 */
export { default } from "@/comp/TitlePage";