/*
      _._.
     / / / _____                __  ___       ___ __       __  _
__._/ / / / ___/_ ________ __  /  |/  /__ ___/ (_) /____ _/ /_(_)__  ___
\ \/ / / / (_ / // / __/ // / / /|_/ / -_) _  / / __/ _ `/ __/ / _ \/ _ \
 \__/_/  \___/\_,_/_/  \_,_/ /_/  /_/\__/\_,_/_/\__/\_,_/\__/_/\___/_//_/

                            ♥ 2021 Ben Dimbeck
                     https://github.com/residualmind
                                                                         */

/**
 * Re-creating the AMIGA Guru Meditation error message
 *
 * @module Guru
 */

export default class Guru {
  static guruInterval;

  /**
   * Display a Guru Meditation
   *
   * @param {string} message
   */

  static meditate(message) {
    const guruElement = document.getElementById('guru_meditation') ?? document.createElement('div');
    const preElement = document.createElement('pre');

    guruElement.setAttribute('id', 'guru_meditation');
    guruElement.innerHTML = '';
    guruElement.style.position = 'relative';
    guruElement.style.zIndex = Number.MAX_SAFE_INTEGER; // is this silly?
    guruElement.style.padding = '10px';
    guruElement.style.margin = '0';
    guruElement.style.width = '100%';
    guruElement.style.textAlign = 'center';
    guruElement.style.backgroundColor = 'black';
    guruElement.style.color = 'red';
    guruElement.style.border = '5px solid red';
    guruElement.style.boxSizing = 'border-box';

    preElement.innerText = 'Guru Meditation: ' + message;
    guruElement.append(preElement);

    clearInterval(this.guruInterval);
    this.guruInterval = setInterval(() => {
      guruElement.style.borderColor = guruElement.style.borderColor === 'red' ? 'black' : 'red';
    }, 750);

    guruElement.addEventListener('click', () => {
      clearInterval(this.guruInterval);
      guruElement.remove();
    });

    try {
      document.children[0].prepend(guruElement);
    } catch {

      // the guru is not in
      // be melting snow
      // wash yourself of yourself

    }
  }
}
