# Research on React Native Fullscreen Video without remount
- On Android, Modal creates a new Dialog, reparenting the view native-side.
- In React, changing the tree hierarchy unmounts the component.
