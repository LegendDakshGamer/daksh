import speech_recognition as sr
import pyttsx3
import datetime
import webbrowser
import os

def recognize_speech():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("Listening...")
        audio = recognizer.listen(source)
        print("Recognizing...")
        try:
            user_input = recognizer.recognize_google(audio)
            print(f"User: {user_input}")
            return user_input
        except sr.UnknownValueError:
            print("Sorry, I couldn't understand that.")
            return ""
        except sr.RequestError as e:
            print(f"Error accessing Google Speech Recognition service: {e}")
            return ""

def respond_to_query(user_input):
    if "hello" in user_input.lower():
        return "Hello! How can I assist you today?"
    elif "how are you" in user_input.lower():
        return "I'm doing well, thank you. How can I help you?"
    elif "stop" in user_input.lower():
        print("Goodbye!")
        exit()
    elif "time" in user_input.lower():
        current_time = datetime.datetime.now().strftime("%H:%M")
        return f"The current time is {current_time}."
    elif "weather" in user_input.lower():
        # You can integrate a weather API here to get real-time weather information
        return "I'm sorry, I don't have access to real-time weather information."
    elif "open youtube" in user_input.lower():
        webbrowser.open("https://www.youtube.com/")
        return "Opening the website for you."
    else:
        return "I'm not sure how to respond to that. Please provide more details."

def main():
    engine = pyttsx3.init()

    while True:
        user_input = recognize_speech()
        response = respond_to_query(user_input)

        print(f"JAI: {response}")
        engine.say(response)
        engine.runAndWait()

if __name__ == "__main__":
    main()
