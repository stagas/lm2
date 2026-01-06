We are implementing documentation for the livecoding audio/music app "loopmaster".

We require to implement an InlineEditor component that can be inserted inbetween paragraphs in a page and is going to be simplistic without the header, and will have a Play/Pause single button. The InlineEditor when played will stop everything else that is playing and play the script in its contents. The code is going to be editable on the fly and the changes will be reflected/compiled on-the-fly as we do it now with the main editor using the same pathways.

We take all the function definitions documentation we already have and create a single page with anchors and a sidebar with links that will jump to those anchors smoothly. It will be a single page with all of the documentation scrollable. All of the examples will transform into InlineEditor components so they become playable.

In addition to that we leave space for markdown documents to be inserted alongside the API docs and create a couple tutorial-style .md documents that will be read and transformed into React components with their source elements (things inside three backticks ```...source...```) automatically becoming InlineEditor components. These tutorials will be also in the navigation sidebar automatically inserted from a folder that we are going to put them in and an array with their filenames that will be fetched from at runtime on startup.

The documentation is going to be in a button with the QuestionIcon from Phosphor that we have already installed, fixed at the bottom right of the screen. When clicked it will open a Modal (the one we have) full width/height with little margin with all the documentation inside.

The documentation will have a search bar at the top with fuzzy search where all of the contents, descriptions, names etc. will be filtered when typing into it and ordered by best match (more closest to the string that is typed). The search bar is going to be focused automatically when the documentation opens with the help/question button.

In the documentation we also put an About section with subsections Contact, Terms of Service and Privacy Statement and we put all the contact information, discord server, legal stuff in there. Write the canonical legal stuff of an app like this. It should be at the end of the list and at the sidebar as well.

The documentation should have the Logo at the top of the scrollable document and a small tagline.
