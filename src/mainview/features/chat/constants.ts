// Chats a capped list shows before it hands off to See all. Both the sidebar and a
// project's page use it.
// Provisional TEST values, here and in CHATS_PAGE_SIZE. Dev has only a handful of chats,
// so a small cap and page size actually exercise the cap, the See-all view, and infinite
// scroll. Revisit before shipping.
export const CHAT_LIST_PREVIEW_LIMIT = 15
export const CHATS_PAGE_SIZE = 25

// Identifies the search palette to the modal store. It lives here rather than beside the
// component so the sidebar button and the Cmd+K hook can open the palette without
// importing the palette itself.
export const SEARCH_MODAL_ID = 'chat-search'

// Shortest query worth running. One or two characters match most of the database and
// tell the user nothing.
export const SEARCH_MIN_QUERY_LENGTH = 2
// Results the palette asks for. Enough to scroll through, few enough to scan.
export const SEARCH_RESULT_LIMIT = 30
